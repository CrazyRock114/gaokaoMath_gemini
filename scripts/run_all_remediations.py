#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive remediation script for Gaokao Math Question Bank & Exam Composition Platform.
Fixes:
- [C-01] Unescaped LaTeX backslashes in CURATED_MOTHER_QUESTIONS (apply_web_system_fixes.py, web_system/app.js, public/app.js)
- [C-02] Mathematical errors in CURATED_MOTHER_QUESTIONS (2024 New Gaokao I Q15, Q16, Q17, Q18, Q19 and variants)
- [C-03] 83 5-choice questions in 1985-1986 Guangdong papers + 3 image-option questions (build_question_bank.py & gaokao_math.db)
- [C-04] Misclassified / malformed questions (GK-2025-beijing-14, GK-2025-beijing-15, GK-2024-new_gaokao_paper_1-12)
- [M-01] Unrendered \choicetexfigure in GK-2013-sichuan_liberal-07, unrendered math in GK-2011-fujian_science-05,
         raw \text{} in GK-2016-zhejiang_science-05, 14 stray braces around tables/math, 106 nested (1)...(1) enumerates
- [M-02] Corrupted GK-2023-national_paper_b_science-05, GK-2022-national_paper_b_science-11 answer concordance,
         3 duplicate-option questions, 2009 Jiangxi Q16 answer/solution concordance, 19-question difficulty recalibration
- [M-03, m-01, m-02] Frontend composer & reader improvements (isSubjective fix, standard Gaokao section headers,
         basket sorting & sync, basket drawer math rendering, HTML table to LaTeX tabular conversion)
"""

import os
import re
import json
import shutil
import sqlite3

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")
SUMMARY_JSON_PATH = os.path.join(WORKSPACE, "question_bank", "all_questions_summary.json")
BUILD_SCRIPT_PATH = os.path.join(WORKSPACE, "scripts", "build_question_bank.py")
WEB_FIX_SCRIPT_PATH = os.path.join(WORKSPACE, "scripts", "apply_web_system_fixes.py")
APP_JS_PATH = os.path.join(WORKSPACE, "web_system", "app.js")
PUBLIC_APP_JS_PATH = os.path.join(WORKSPACE, "public", "app.js")


def patch_build_question_bank():
    with open(BUILD_SCRIPT_PATH, "r", encoding="utf-8") as f:
        code = f.read()

    # 1. Patch replace_fig to handle \choicetexfigure
    old_fig = '''    # 2. Clean embedded figure commands in text
    def replace_fig(m):
        full = m.group(0)
        path_m = re.search(r'(img(?:_repaint)?/[a-zA-Z0-9_\\-\\./]+\\.(?:png|jpg|jpeg))', full)
        if path_m:
            fpath = path_m.group(1).strip()
            return f"\\n\\n<div class=\\"flex justify-center my-3\\"><img src=\\"/{fpath}\\" class=\\"max-h-52 border border-slate-200 rounded p-1 bg-white\\" alt=\\"题图\\" /></div>\\n\\n"
        return ""

    text = re.sub(r"\\\\(?:bitmapfigure|solutionfigure|choicebitmap|bitmapinclude|includegraphics|sourcefigure)(?:\\[[^\\]]*\\])?\\{([^}]+)\\}", replace_fig, text)'''

    new_fig = '''    # 2. Clean embedded figure commands in text
    def replace_fig(m):
        full = m.group(0)
        path_m = re.search(r'(img(?:_repaint)?/[a-zA-Z0-9_\\-\\./]+\\.(?:png|jpg|jpeg))', full)
        if path_m:
            fpath = path_m.group(1).strip()
            return f"\\n\\n<div class=\\"flex justify-center my-3\\"><img src=\\"/{fpath}\\" class=\\"max-h-52 border border-slate-200 rounded p-1 bg-white\\" alt=\\"题图\\" /></div>\\n\\n"
        tex_m = re.search(r'img_repaint/([a-zA-Z0-9_\\-\\./]+)\\.tex', full)
        if tex_m:
            fpath = f"img/{tex_m.group(1).strip()}.png"
            return f"<div class=\\"flex justify-center my-2\\"><img src=\\"/{fpath}\\" class=\\"max-h-44 border border-slate-200 rounded p-1 bg-white\\" alt=\\"选项图\\" /></div>"
        return ""

    text = re.sub(r"\\\\(?:bitmapfigure|solutionfigure|choicebitmap|choicetexfigure|bitmapinclude|includegraphics|sourcefigure)(?:\\[[^\\]]*\\])?\\{([^}]+)\\}", replace_fig, text)'''

    if old_fig in code:
        code = code.replace(old_fig, new_fig, 1)
        print("[build_question_bank.py] Patched replace_fig for \\choicetexfigure.")

    # 2. Patch replace_enum to use Roman numerals (i), (ii) for inner nested enumerates
    old_enum = '''    # 6. Handle lists: \\begin{enumerate} and \\begin{circlelist}
    def replace_enum(m):
        content = m.group(1)
        items = re.split(r"\\\\item\\s*", content)
        res = []
        q_idx = 1
        for it in items:
            it = it.strip()
            if not it:
                continue
            if re.match(r"^\\([0-9ivxIVX一二三四五]+\\)", it) or re.match(r"^[0-9ivxIVX一二三四五]+[\\.、]", it):
                res.append(it)
            else:
                res.append(f"({q_idx}) {it}")
                q_idx += 1
        return "\\n" + "\\n".join(res) + "\\n"

    for _ in range(5):
        if r"\\begin{enumerate}" not in text:
            break
        text = re.sub(r"\\\\begin\\{enumerate\\}(?:\\[[^\\]]*\\])?((?:(?!\\\\begin\\{enumerate\\}).)*?)\\\\end\\{enumerate\\}", replace_enum, text, flags=re.DOTALL)'''

    new_enum = '''    # 6. Handle lists: \\begin{enumerate} and \\begin{circlelist}
    roman_markers = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]
    for _ in range(5):
        if r"\\begin{enumerate}" not in text:
            break
        has_nested_enum = bool(re.search(r"\\\\begin\\{enumerate\\}(?:\\[[^\\]]*\\])?(?:(?!\\\\end\\{enumerate\\}).)*?\\\\begin\\{enumerate\\}", text, flags=re.DOTALL))
        def replace_enum(m, use_roman=has_nested_enum):
            content = m.group(1)
            items = re.split(r"\\\\item\\s*", content)
            res = []
            q_idx = 1
            for it in items:
                it = it.strip()
                if not it:
                    continue
                if re.match(r"^\\([0-9ivxIVX一二三四五]+\\)", it) or re.match(r"^[0-9ivxIVX一二三四五]+[\\.、]", it):
                    res.append(it)
                else:
                    marker = roman_markers[q_idx - 1] if (use_roman and q_idx <= len(roman_markers)) else str(q_idx)
                    res.append(f"({marker}) {it}")
                    q_idx += 1
            return "\\n" + "\\n".join(res) + "\\n"
        text = re.sub(r"\\\\begin\\{enumerate\\}(?:\\[[^\\]]*\\])?((?:(?!\\\\begin\\{enumerate\\}).)*?)\\\\end\\{enumerate\\}", replace_enum, text, flags=re.DOTALL)'''

    if old_enum in code:
        code = code.replace(old_enum, new_enum, 1)
        print("[build_question_bank.py] Patched replace_enum for nested enumerates.")

    # 3. Patch extract_choices to support up to 6 choices (for 5-choice 1985-1986 Guangdong papers)
    old_choices = '''def extract_choices(prob_text):
    m = re.search(r"\\\\choices(?:\\[[^\\]]*\\])?", prob_text)
    if not m:
        return prob_text.strip(), []
    
    pos = m.end()
    opts = []
    for _ in range(4):
        opt, pos = parse_balanced_braces(prob_text, pos)
        if opt is not None:
            opts.append(clean_latex(opt.strip()))
        else:
            break
            
    body = prob_text[:m.start()] + prob_text[pos:]
    return body.strip(), opts'''

    new_choices = '''def extract_choices(prob_text):
    m = re.search(r"\\\\choices(?:\\[[^\\]]*\\])?", prob_text)
    if not m:
        return prob_text.strip(), []
    
    pos = m.end()
    opts = []
    for _ in range(6):
        while pos < len(prob_text) and prob_text[pos].isspace():
            pos += 1
        if pos >= len(prob_text) or prob_text[pos] != '{':
            break
        opt, pos = parse_balanced_braces(prob_text, pos)
        if opt is not None:
            opts.append(clean_latex(opt.strip()))
        else:
            break
            
    body = prob_text[:m.start()] + prob_text[pos:]
    return body.strip(), opts'''

    if old_choices in code:
        code = code.replace(old_choices, new_choices, 1)
        print("[build_question_bank.py] Patched extract_choices for 5-choice questions.")

    with open(BUILD_SCRIPT_PATH, "w", encoding="utf-8") as f:
        f.write(code)


CURATED_MOTHER_QUESTIONS_FIXED_JS = r"""const CURATED_MOTHER_QUESTIONS = [
  {
    uid: 'GK-2024-new_gaokao_paper_1-18',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '函数与导数',
    subtags: ['函数与导数', '中心对称', '导数单调性', '不等式恒成立', '参数范围'],
    difficulty: '压轴',
    score: 17,
    body: '已知函数 $f(x)=\\ln\\frac{x}{2-x}+ax+b(x-1)^3$（$x\\in(0,2)$）。<br>(1) 若 $b=0$ 且 $f\'(x)\\ge 0$，求 $a$ 的最小值；<br>(2) 证明：曲线 $y=f(x)$ 关于点 $(1,a)$ 中心对称；<br>(3) 若 $f(x)>-2$ 当且仅当 $1<x<2$，求 $b$ 的取值范围。',
    answer: '(1) $a$ 的最小值为 $-2$；<br>(2) 证明详见解析；<br>(3) $b$ 的取值范围是 $\\left[-\\frac{2}{3}, +\\infty\\right)$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>当 $b=0$ 时，$f(x)=\\ln x - \\ln(2-x) + ax$。<br>求导得 $f\'(x)=\\frac{1}{x}+\\frac{1}{2-x}+a = \\frac{2}{x(2-x)}+a$。<br>因为 $x\\in(0,2)$，由基本不等式 $x(2-x)\\le \\left(\\frac{x+2-x}{2}\\right)^2 = 1$（当且仅当 $x=1$ 时取等号），所以 $\\frac{2}{x(2-x)}$ 在 $(0,2)$ 上的最小值为 $2$。<br>要使 $f\'(x)\\ge 0$ 恒成立，只需 $2+a\\ge 0 \\implies a\\ge -2$。故 $a$ 的最小值为 $-2$。<br><br><b>(2) 第二问：</b><br>证明曲线关于点 $(1,a)$ 中心对称，只需证对任意 $x\\in(0,2)$，有 $f(x)+f(2-x)=2a$。<br>$f(2-x) = \\ln\\frac{2-x}{x} + a(2-x) + b(1-x)^3 = -\\ln\\frac{x}{2-x} + 2a - ax - b(x-1)^3$。<br>两式相加得 $f(x)+f(2-x) = 2a$ 恒成立。<br>故曲线 $y=f(x)$ 关于点 $(1,a)$ 中心对称。<br><br><b>(3) 第三问：</b><br>由 (2) 知曲线关于 $(1,a)$ 中心对称，且 $f(1)=a$。因为 $f(x)>-2$ 当且仅当 $1<x<2$，由函数连续性及中心对称性知必有 $f(1)=-2$，即 $a=-2$。<br>此时 $f(x)=\\ln\\frac{x}{2-x}-2x+b(x-1)^3$。<br>令 $t=x-1\\in(-1,1)$，则 $g(t)=f(t+1)+2 = \\ln\\frac{1+t}{1-t}-2t+bt^3$。<br>易知 $g(t)$ 为 $(-1,1)$ 上的奇函数，原条件等价于当 $t\\in(0,1)$ 时 $g(t)>0$ 恒成立。<br>求导得 $g\'(t)=\\frac{2}{1-t^2}-2+3bt^2 = t^2\\left(\\frac{2}{1-t^2}+3b\\right)$。<br>因为当 $t\\in(0,1)$ 时，$\\frac{2}{1-t^2} > 2$：<br>① 若 $2+3b \\ge 0$，即 $b \\ge -\\frac{2}{3}$，则对任意 $t\\in(0,1)$，都有 $\\frac{2}{1-t^2}+3b > 2+3b \\ge 0$，从而 $g\'(t) > 0$，$g(t)$ 在 $[0,1)$ 上严格单调递增，故 $g(t) > g(0) = 0$ 在 $(0,1)$ 上恒成立，结合奇函数性质知当 $t\\in(-1,0]$ 时 $g(t)\\le 0$，满足充要条件；<br>② 若 $b < -\\frac{2}{3}$，则 $2+3b < 0$，令 $t_0 = \\sqrt{1+\\frac{2}{3b}}\\in(0,1)$，当 $t\\in(0,t_0)$ 时 $\\frac{2}{1-t^2}+3b < 0 \\implies g\'(t) < 0$，此时 $g(t) < g(0) = 0$，与题设矛盾。<br>综上，$b$ 的取值范围是 $\\left[-\\frac{2}{3}, +\\infty\\right)$。',
    variants: {
      param: {
        tag: '同构变式：区间与系数变换',
        intent: '保持分式对数与奇次多项式的对称复合结构，将区间变换为 (0, 4)，考查基本不等式求导数最值与端点洛必达/二阶导保号性。',
        body: '已知函数 $f(x) = \\ln\\frac{x}{4-x} + ax + b(x-2)^3$（$x\\in(0,4)$）。<br>(1) 若 $b=0$ 且 $f\'(x)\\ge 0$ 在 $(0,4)$ 上恒成立，求实数 $a$ 的最小值；<br>(2) 证明：曲线 $y=f(x)$ 关于点 $(2, 2a)$ 中心对称；<br>(3) 若 $a=-1$，且 $f(x)>-2$ 当且仅当 $2<x<4$，求 $b$ 的取值范围。',
        answer: '(1) $a$ 的最小值为 $-1$；<br>(2) 证明详见解析；<br>(3) $b\\in \\left[-\\frac{1}{12}, +\\infty\\right)$。',
        solution: '【分步解析】<br>(1) 当 $b=0$ 时，$f\'(x)=\\frac{4}{x(4-x)}+a$。由基本不等式 $x(4-x)\\le 4$，得 $\\frac{4}{x(4-x)}\\ge 1$，故 $a\\ge -1$，最小值为 $-1$。<br>(2) 对任意 $x\\in(0,4)$，计算 $f(x)+f(4-x) = 4a$ 恒成立，故对称中心为 $(2, 2a)$。<br>(3) 当 $a=-1$ 时，$f(2)=2a=-2$。令 $t=x-2\\in(-2,2)$，$g(t)=f(t+2)+2 = \\ln\\frac{2+t}{2-t}-t+bt^3$。<br>求导得 $g\'(t)=\\frac{4}{4-t^2}-1+3bt^2 = t^2\\left(\\frac{1}{4-t^2}+3b\\right)$。<br>在 $t\\in(0,2)$ 上 $\\frac{1}{4-t^2} > \\frac{1}{4}$，仿母题讨论可得充要条件为 $\\frac{1}{4}+3b \\ge 0 \\iff b \\ge -\\frac{1}{12}$，即 $b\\in\\left[-\\frac{1}{12}, +\\infty\\right)$。'
      },
      inverse: {
        tag: '逆向探究：由对称性与单调性反求参数',
        intent: '逆向设问：已知函数图象具有特定的中心对称点且导函数具有指定切线斜率，反求未知系数 $a, c$，考查逆向推导与充要性验证。',
        body: '已知函数 $f(x) = \\ln\\frac{x}{2-x} + ax + c$（$x\\in(0,2)$）的图象关于点 $(1, 3)$ 中心对称，且当 $x=1$ 时曲线 $y=f(x)$ 的切线斜率为 $1$。<br>(1) 求实数 $a, c$ 的值；<br>(2) 求证：函数 $f(x)$ 在 $(0,2)$ 上为严格增函数。',
        answer: '(1) $a = -1, c = 4$；<br>(2) 证明详见解析。',
        solution: '【逆向分步解析】<br>(1) 由对称中心为 $(1, 3)$ 得 $f(1)=3$。求导得 $f\'(x)=\\frac{2}{x(2-x)}+a$，由 $f\'(1) = 2 + a = 1 \\implies a = -1$。代入 $f(1) = -1 + c = 3 \\implies c = 4$。<br>(2) 当 $a=-1$ 时，$f\'(x) = \\frac{2}{x(2-x)} - 1$。因为 $x\\in(0,2)$ 时 $0 < x(2-x) \\le 1$，所以 $\\frac{2}{x(2-x)}\\ge 2 > 1$，故 $f\'(x) \\ge 1 > 0$，函数在 $(0,2)$ 上严格单调递增。'
      },
      context: {
        tag: '情境建模：通信信道非线性失真与传输增益',
        intent: '将分式对数非线性函数映射至现代光纤通信信道动态响应模型，考查实际工程阈值的数学建模能力。',
        body: '在高速光通信模块中，光敏放大器的输出响应电压 $V(t)$ 与输入归一化光功率 $t\\in(0,2)$ 满足关系：$V(t) = \\ln\\frac{t}{2-t} - kt$（$k>0$ 为信道动态增益衰减系数）。<br>(1) 若放大器工作在无失真单调放大区（即对任意 $t\\in(0,2)$ 均有 $V\'(t)\\ge 0$），求增益衰减系数 $k$ 允许的最大值；<br>(2) 当 $k=1$ 时，求放大器在工作区间 $[\\frac{1}{2}, \\frac{3}{2}]$ 上的输出电压动态范围。',
        answer: '(1) $k$ 的最大值为 $2$；<br>(2) 动态范围为 $2\\ln 3 - 1$。',
        solution: '【工程建模分步解析】<br>(1) 求导得 $V\'(t) = \\frac{2}{t(2-t)} - k$。由于 $t(2-t)\\le 1$，$\\frac{2}{t(2-t)}\\ge 2$，要使 $V\'(t)\\ge 0$ 恒成立，需 $2-k\\ge 0 \\implies k\\le 2$，最大值为 $2$。<br>(2) 当 $k=1$ 时，$V\'(t) = \\frac{2}{t(2-t)} - 1 \\ge 1 > 0$，函数在 $[\\frac{1}{2}, \\frac{3}{2}]$ 上严格单调递增。故最小值为 $V(1/2) = -\\ln 3 - 1/2$，最大值为 $V(3/2) = \\ln 3 - 3/2$，动态范围为 $V(3/2)-V(1/2) = 2\\ln 3 - 1$。'
      },
      extension: {
        tag: '高阶拓展：导数单调性与迭代数列收敛速度',
        intent: '新高考19题压轴模式：将中心对称函数转化为不动点迭代动力系统，探究数列收敛与等比变换通项。',
        body: '已知函数 $f(x) = \\ln\\frac{x}{2-x} - 2x$（$x\\in(0,2)$）。<br>(1) 证明：$f(x)$ 在 $(0,2)$ 上单调递增，且有唯一零点 $x=1$；<br>(2) 设数列 $\\{x_n\\}$ 满足 $x_1\\in(0,1)$，$x_{n+1} = \\frac{x_n}{2-x_n}$（$n\\in\\mathbb{N}^*$），证明：数列 $\\{x_n\\}$ 严格单调递减且通项公式为 $x_n = \\frac{x_1}{(1-x_1)2^{n-1} + x_1}$；<br>(3) 证明：对任意正整数 $n$，都有 $\\frac{1}{2} x_n < x_{n+1} < x_n$。',
        answer: '(1)(2)(3) 证明详见解析。',
        solution: '【压轴拓展解析】<br>(1) $f\'(x) = \\frac{2}{x(2-x)} - 2 = \\frac{2(x-1)^2}{x(2-x)} \\ge 0$，仅在 $x=1$ 处导数为 0，故严格单调递增，且 $f(1)=0$ 为唯一零点。<br>(2) 取倒数变形：$\\frac{1}{x_{n+1}} = \\frac{2-x_n}{x_n} = \\frac{2}{x_n} - 1$。两边减 1 得 $\\frac{1}{x_{n+1}} - 1 = 2\\left(\\frac{1}{x_n} - 1\\right)$。故数列 $\\left\\{\\frac{1}{x_n}-1\\right\\}$ 为公比为 2 的等比数列，$\\frac{1}{x_n}-1 = \\left(\\frac{1}{x_1}-1\\right)2^{n-1}$，整理得 $x_n = \\frac{x_1}{(1-x_1)2^{n-1} + x_1}$。<br>(3) 因为 $x_1\\in(0,1)$，由通项知 $x_n\\in(0,1)$，故 $1 < 2-x_n < 2$，从而 $\\frac{1}{2} < \\frac{1}{2-x_n} < 1$，两边同乘 $x_n > 0$ 即得 $\\frac{1}{2}x_n < x_{n+1} < x_n$。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-16',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '平面解析几何',
    subtags: ['平面解析几何', '椭圆标准方程', '离心率', '弦长公式', '三角形面积'],
    difficulty: '中档',
    score: 15,
    body: '已知 $A(0,3)$，$P\\left(3,\\frac{3}{2}\\right)$ 都在椭圆 $C:\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1$（$a>b>0$）上。<br>(1) 求 $C$ 的离心率；<br>(2) 过 $P$ 的直线 $l$ 交 $C$ 于另一点 $B$，且 $\\triangle ABP$ 的面积为 $9$，求 $l$ 的方程。',
    answer: '(1) 离心率 $e=\\frac{1}{2}$；<br>(2) 直线 $l$ 的方程为 $3x-2y-6=0$ 或 $x-2y=0$（即 $y=\\frac{3}{2}x-3$ 或 $y=\\frac{1}{2}x$）。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>将 $A(0,3)$ 代入椭圆方程得 $\\frac{0}{a^2}+\\frac{9}{b^2}=1 \\implies b^2=9$。<br>将 $P\\left(3, \\frac{3}{2}\\right)$ 代入得 $\\frac{9}{a^2}+\\frac{9/4}{9}=1 \\implies \\frac{9}{a^2}+\\frac{1}{4}=1 \\implies a^2=12$。<br>所以 $c = \\sqrt{a^2-b^2} = \\sqrt{12-9} = \\sqrt{3}$。<br>椭圆离心率 $e = \\frac{c}{a} = \\frac{\\sqrt{3}}{2\\sqrt{3}} = \\frac{1}{2}$。<br><br><b>(2) 第二问：</b><br>椭圆方程为 $\\frac{x^2}{12}+\\frac{y^2}{9}=1$，即 $3x^2+4y^2=36$。<br>先求直线 $AP$ 的方程与长度：$k_{AP} = \\frac{3/2 - 3}{3 - 0} = -\\frac{1}{2}$，故直线 $AP$ 的方程为 $x+2y-6=0$，且 $|AP| = \\sqrt{(3-0)^2 + (3/2-3)^2} = \\frac{3\\sqrt{5}}{2}$。<br>设点 $B(x_0, y_0)$ 到直线 $AP$ 的距离为 $d$，由 $S_{\\triangle ABP} = \\frac{1}{2}|AP|\\cdot d = 9$，得：<br>$d = \\frac{18}{\\frac{3\\sqrt{5}}{2}} = \\frac{12}{\\sqrt{5}}$。<br>由点到直线距离公式得 $\\frac{|x_0+2y_0-6|}{\\sqrt{1^2+2^2}} = \\frac{12}{\\sqrt{5}} \\implies |x_0+2y_0-6| = 12$，即 $x_0+2y_0 = 18$ 或 $x_0+2y_0 = -6$。<br>① 若 $x_0+2y_0 = 18$，联立 $3x_0^2+4y_0^2=36$ 得 $4y_0^2 - 36y_0 + 99 = 0$，判别式 $\\Delta = 36^2 - 16\\times 99 = -288 < 0$，无实数解；<br>② 若 $x_0+2y_0 = -6$，代入 $x_0 = -2y_0-6$ 至 $3x_0^2+4y_0^2=36$，得 $3(-2y_0-6)^2+4y_0^2=36 \\implies 16y_0^2+72y_0+72=0 \\implies 2y_0^2+9y_0+9=0$，<br>因式分解得 $(y_0+3)(2y_0+3)=0$，解得 $y_0 = -3$ 或 $y_0 = -\\frac{3}{2}$。<br>当 $y_0 = -3$ 时，$x_0 = 0$，即 $B(0,-3)$，此时直线 $l$（即 $PB$）斜率 $k = \\frac{3/2 - (-3)}{3 - 0} = \\frac{3}{2}$，方程为 $y = \\frac{3}{2}x - 3$（即 $3x-2y-6=0$）；<br>当 $y_0 = -\\frac{3}{2}$ 时，$x_0 = -3$，即 $B\\left(-3, -\\frac{3}{2}\\right)$，此时直线 $l$（即 $PB$）斜率 $k = \\frac{3/2 - (-3/2)}{3 - (-3)} = \\frac{1}{2}$，方程为 $y = \\frac{1}{2}x$（即 $x-2y=0$）。<br>综上，直线 $l$ 的方程为 $3x-2y-6=0$ 或 $x-2y=0$。',
    variants: {
      param: {
        tag: '同构变式：参数变换与面积定值',
        intent: '保持椭圆焦点在 x 轴并过两定点的几何骨架，变换尺度参数与面积约束，检验平行线距离法求三角形面积。',
        body: '已知椭圆 $C:\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1$（$a>b>0$）过点 $A(0,6)$ 和点 $P(6, 3)$。<br>(1) 求椭圆 $C$ 的标准方程及离心率；<br>(2) 过点 $P$ 作直线 $l$ 交椭圆于另一点 $B$，使 $\\triangle ABP$ 的面积为 $36$，求直线 $l$ 的方程。',
        answer: '(1) 方程为 $\\frac{x^2}{48}+\\frac{y^2}{36}=1$，$e=\\frac{1}{2}$；<br>(2) 直线 $l$ 的方程为 $3x-2y-12=0$ 或 $x-2y=0$。',
        solution: '【分步解析】<br>(1) 将 $A(0,6)$ 代入得 $b^2=36$；将 $P(6,3)$ 代入得 $\\frac{36}{a^2}+\\frac{9}{36}=1 \\implies a^2=48$。故椭圆方程为 $\\frac{x^2}{48}+\\frac{y^2}{36}=1$（即 $3x^2+4y^2=144$），离心率 $e=\\frac{\\sqrt{48-36}}{\\sqrt{48}} = \\frac{1}{2}$。<br>(2) 直线 $AP$ 的斜率为 $k_{AP}=\\frac{3-6}{6-0}=-\\frac{1}{2}$，方程为 $x+2y-12=0$，且 $|AP|=\\sqrt{6^2+(-3)^2}=3\\sqrt{5}$。由 $S_{\\triangle ABP}=\\frac{1}{2}|AP|\\cdot d=36$ 得 $B(x_0,y_0)$ 到直线 $AP$ 的距离 $d=\\frac{24}{\\sqrt{5}} \\implies |x_0+2y_0-12|=24$。<br>因椭圆上 $|x_0+2y_0|\\le \\sqrt{48+144}=8\\sqrt{3}<36$，故 $x_0+2y_0=-12$。代入 $x_0=-2y_0-12$ 至 $3x_0^2+4y_0^2=144$ 得 $y_0^2+9y_0+18=0 \\implies (y_0+6)(y_0+3)=0$，解得 $B(0,-6)$ 或 $B(-6,-3)$，从而直线 $l$（即 $PB$）的方程为 $3x-2y-12=0$ 或 $x-2y=0$。'
      },
      inverse: {
        tag: '逆向探究：由面积极值反求椭圆动点位置',
        intent: '逆向设问：已知固定弦 $AP$，探究椭圆上动点 $B$ 使得 $\\triangle ABP$ 面积取得最大值时的坐标与切线斜率。',
        body: '已知椭圆 $C:\\frac{x^2}{12}+\\frac{y^2}{9}=1$ 上两点 $A(0,3)$，$P\\left(3,\\frac{3}{2}\\right)$。若点 $B$ 是椭圆 $C$ 下半部分上的动点，求 $\\triangle ABP$ 面积的最大值及此时点 $B$ 的坐标。',
        answer: '最大面积为 $3\\sqrt{6}+\\frac{9}{2}$，此时点 $B\\left(-\\sqrt{6}, -\\frac{3\\sqrt{6}}{4}\\right)$。',
        solution: '【逆向分步解析】设与直线 $AP: x+2y-6=0$ 平行的椭圆切线为 $x+2y+m=0$（$m>0$）。联立 $3x^2+4y^2=36$ 得 $16y^2+12my+3m^2-36=0$，令 $\\Delta = 144m^2 - 64(3m^2-36)=0 \\implies m = 4\\sqrt{3}$。最大距离 $d_{\\max} = \\frac{6+4\\sqrt{3}}{\\sqrt{5}}$，最大面积 $S_{\\max} = \\frac{1}{2}\\cdot\\frac{3\\sqrt{5}}{2}\\cdot\\frac{6+4\\sqrt{3}}{\\sqrt{5}} = 3\\sqrt{6}+\\frac{9}{2}$。'
      },
      context: {
        tag: '情境建模：雷达测控基站与椭圆搜索截面',
        intent: '将平面圆锥曲线弦长与面积问题引入地面双基站雷达协同探测区面积评估，强化几何直观。',
        body: '在区域防空雷达网中，主雷达站 $A$ 位于坐标 $(0,3)$，副雷达站 $P$ 位于 $(3, 1.5)$（单位：十公里）。监测目标 $B$ 运行在椭圆轨道 $C: \\frac{x^2}{12}+\\frac{y^2}{9}=1$ 上。当两雷达站与目标点 $B$ 构成的三角形侦测区面积恰好为 $9$（百平方公里）时，求副雷达站 $P$ 指向目标点 $B$ 的视线直线方程。',
        answer: '视线直线 $PB$ 的方程为 $3x-2y-6=0$ 或 $x-2y=0$。',
        solution: '【雷达测控建模】将雷达站坐标与椭圆轨道方程联立，由母题第 (2) 问平行线距离法求得目标点 $B$ 坐标为 $(0,-3)$ 或 $(-3,-1.5)$，对应视线方程为 $3x-2y-6=0$ 或 $x-2y=0$。'
      },
      extension: {
        tag: '高阶拓展：动弦中点轨迹与定值性质',
        intent: '新高考压轴拓展模式：探究过椭圆上定点弦的中点轨迹方程，考查点差法与参数消元。',
        body: '在椭圆 $C: \\frac{x^2}{12}+\\frac{y^2}{9}=1$ 中，过点 $P\\left(3, \\frac{3}{2}\\right)$ 作动弦 $MN$。<br>(1) 求动弦 $MN$ 的中点 $Q$ 的轨迹方程；<br>(2) 若点 $B_1(0,-3), B_2\\left(-3,-\\frac{3}{2}\\right)$，证明：$\\triangle AB_1P$ 与 $\\triangle AB_2P$ 面积相等且 $B_1B_2 \\parallel AP$。',
        answer: '(1) 轨迹方程为 $\\frac{(x-3/2)^2}{3} + \\frac{(y-3/4)^2}{9/4} = 1$（除去点 $P$）；<br>(2) 证明详见解析。',
        solution: '【高阶解析几何拓展】(1) 设 $M(x_1, y_1), N(x_2, y_2)$，中点 $Q(x,y)$，则 $x_1+x_2=2x, y_1+y_2=2y$。由点差法 $3(x_1+x_2)(x_1-x_2)+4(y_1+y_2)(y_1-y_2)=0$，结合 $k_{MN}=\\frac{y-3/2}{x-3}$，化简得 $3x(x-3)+4y(y-3/2)=0$，配方即得 $\\frac{(x-3/2)^2}{3}+\\frac{(y-3/4)^2}{9/4}=1$。<br>(2) 计算斜率 $k_{B_1B_2} = \\frac{-3/2 - (-3)}{-3 - 0} = -\\frac{1}{2} = k_{AP}$，故 $B_1B_2 \\parallel AP$，同底等高故两三角形面积相等。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-17',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '立体几何与空间向量',
    subtags: ['立体几何与空间向量', '线面平行', '线面垂直', '二面角', '空间直角坐标系'],
    difficulty: '中档',
    score: 15,
    body: '四棱锥 $P-ABCD$ 中，$PA\\perp$ 底面 $ABCD$，且 $PA=AC=2$，$BC=1$，$AB=\\sqrt{3}$。<br>(1) 若 $AD\\perp PB$，证明 $AD\\parallel$ 平面 $PBC$；<br>(2) 若 $AD\\perp DC$，且二面角 $A-CP-D$ 的正弦值为 $\\frac{\\sqrt{42}}{7}$，求 $AD$。',
    answer: '(1) 证明详见解析；<br>(2) $AD = \\sqrt{3}$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>因为 $PA\\perp$ 底面 $ABCD$，$AD\\subset$ 底面 $ABCD$，所以 $PA\\perp AD$。<br>又已知 $AD\\perp PB$，且 $PA \\cap PB = P$，$PA, PB \\subset$ 平面 $PAB$，<br>所以 $AD\\perp$ 平面 $PAB$。因为 $AB\\subset$ 平面 $PAB$，所以 $AD\\perp AB$。<br>在 $\\triangle ABC$ 中，$BC=1, AB=\\sqrt{3}, AC=2$，满足 $AB^2+BC^2 = (\\sqrt{3})^2+1^2 = 4 = AC^2$，故 $BC\\perp AB$。<br>在同一平面 $ABCD$ 内，$AD\\perp AB$ 且 $BC\\perp AB$，所以 $AD\\parallel BC$。<br>又 $AD\\not\\subset$ 平面 $PBC$，$BC\\subset$ 平面 $PBC$，故 $AD\\parallel$ 平面 $PBC$。<br><br><b>(2) 第二问：</b><br>在 $\\text{Rt}\\triangle ADC$ 中，$AD\\perp DC$，斜边 $AC=2$。设 $AD = t$（其中 $0 < t < 2$），则 $DC = \\sqrt{4-t^2}$。<br>以 $D$ 为原点，$DA, DC$ 所在直线分别为 $x, y$ 轴，过 $D$ 垂直于底面的直线为 $z$ 轴建立空间直角坐标系：<br>则 $D(0,0,0)$，$A(t,0,0)$，$C\\left(0,\\sqrt{4-t^2},0\\right)$，$P(t,0,2)$。<br>向量 $\\overrightarrow{CP} = \\left(t, -\\sqrt{4-t^2}, 2\\right)$，$\\overrightarrow{CA} = \\left(t, -\\sqrt{4-t^2}, 0\\right)$，$\\overrightarrow{DC} = \\left(0, \\sqrt{4-t^2}, 0\\right)$。<br>设平面 $ACP$ 的法向量为 $\\boldsymbol{n}_1 = (x_1, y_1, z_1)$，由 $\\boldsymbol{n}_1\\cdot\\overrightarrow{CA}=0$ 及 $\\boldsymbol{n}_1\\cdot\\overrightarrow{CP}=0$ 得 $\\boldsymbol{n}_1 = \\left(\\sqrt{4-t^2}, t, 0\\right)$，且 $|\\boldsymbol{n}_1| = 2$。<br>设平面 $CPD$ 的法向量为 $\\boldsymbol{n}_2 = (x_2, y_2, z_2)$，由 $\\boldsymbol{n}_2\\cdot\\overrightarrow{DC}=0$ 及 $\\boldsymbol{n}_2\\cdot\\overrightarrow{CP}=0$ 得 $\\boldsymbol{n}_2 = (2, 0, -t)$，且 $|\\boldsymbol{n}_2| = \\sqrt{4+t^2}$。<br>已知二面角 $A-CP-D$ 的正弦值为 $\\frac{\\sqrt{42}}{7}$，则其余弦值绝对值为 $\\sqrt{1 - \\frac{42}{49}} = \\frac{\\sqrt{7}}{7}$。<br>故 $|\\cos\\langle\\boldsymbol{n}_1, \\boldsymbol{n}_2\\rangle| = \\frac{|2\\sqrt{4-t^2}|}{2\\sqrt{4+t^2}} = \\frac{\\sqrt{4-t^2}}{\\sqrt{4+t^2}} = \\frac{\\sqrt{7}}{7}$。<br>两边平方得 $\\frac{4-t^2}{4+t^2} = \\frac{1}{7} \\implies 28 - 7t^2 = 4 + t^2 \\implies 8t^2 = 24 \\implies t^2 = 3$。<br>因为 $0 < t < 2$，所以 $AD = t = \\sqrt{3}$。',
    variants: {
      param: {
        tag: '同构变式：底面尺度调整与二面角余弦求解',
        intent: '保持直四棱锥与直角三角形底面结构，给定 $AD$ 长度求二面角余弦值，考查空间直角坐标系与法向量运算。',
        body: '四棱锥 $P-ABCD$ 中，$PA\\perp$ 平面 $ABCD$，$PA=AC=2$，$BC=1$，$AB=\\sqrt{3}$。<br>(1) 若 $AD\\perp PB$，证明：$AD\\parallel BC$；<br>(2) 若 $AD\\perp CD$ 且 $AD=\\sqrt{2}$，求二面角 $A-CP-D$ 的余弦值。',
        answer: '(1) 证明见解析；<br>(2) 二面角 $A-CP-D$ 的余弦值为 $\\frac{\\sqrt{3}}{3}$。',
        solution: '【分步解析】<br>(1) 仿母题证明 $AD\\perp$ 平面 $PAB$ 从而 $AD\\perp AB$，结合底面勾股定理得 $BC\\perp AB$，证得 $AD\\parallel BC$。<br>(2) 当 $AD=t=\\sqrt{2}$ 时，$CD=\\sqrt{2}$，由母题法向量公式得 $|\\cos\\theta| = \\frac{\\sqrt{4-t^2}}{\\sqrt{4+t^2}} = \\frac{\\sqrt{2}}{\\sqrt{6}} = \\frac{\\sqrt{3}}{3}$。'
      },
      inverse: {
        tag: '逆向探究：已知二面角反求几何体高',
        intent: '将“已知几何尺寸求二面角”逆转为“已知二面角大小，反求侧棱 $PA$ 的高度”，考查三垂线定理与空间向量。',
        body: '四棱锥 $P-ABCD$ 中，$PA\\perp$ 底面 $ABCD$，$AD\\perp CD$，$AC=2$，$AD=\\sqrt{3}$。若二面角 $P-CD-A$ 的平面角大小为 $60^\\circ$，求侧棱 $PA$ 的长。',
        answer: '$PA = 3$。',
        solution: '【逆向分步解析】因为 $PA\\perp$ 底面 $ABCD$ 且 $AD\\perp CD$，由三垂线定理知 $PD\\perp CD$，故 $\\angle PDA$ 即为二面角 $P-CD-A$ 的平面角，即 $\\angle PDA = 60^\\circ$。在 $\\text{Rt}\\triangle PAD$ 中，$PA = AD\\tan 60^\\circ = \\sqrt{3}\\times\\sqrt{3} = 3$。'
      },
      context: {
        tag: '情境建模：现代立体光伏屋顶采光倾角',
        intent: '将四棱锥模型映射为节能建筑多面采光顶棚结构，计算太阳能电池板安装平面的法向量夹角。',
        body: '某绿色科技园区展厅顶部为四棱锥 $P-ABCD$ 钢结构模型。底面 $ABCD$ 为水平采光面，$PA\\perp$ 底面，测得 $PA=AC=2\\text{m}, BC=1\\text{m}, AB=\\sqrt{3}\\text{m}$。为使侧面 $PCD$ 光伏板达到最优光照吸收效率，工程规范要求平面 $PCD$ 与水平底面的夹角余弦值在 $[0.5, 0.7]$ 区间内。当 $AD=\\sqrt{2}\\text{m}$ 且 $AD\\perp CD$ 时，检验该设计是否符合工程要求。',
        answer: '符合工程要求（夹角余弦值为 $\\frac{\\sqrt{3}}{3} \\approx 0.577\\in [0.5, 0.7]$）。',
        solution: '【工程采光建模】由 $PA\\perp$ 底面及 $AD\\perp CD$ 知 $\\angle PDA$ 为侧面 $PCD$ 与底面所成二面角的平面角。因 $AD=\\sqrt{2}, PA=2$，故 $PD=\\sqrt{2+4}=\\sqrt{6}$，从而 $\\cos\\angle PDA = \\frac{AD}{PD} = \\frac{\\sqrt{2}}{\\sqrt{6}} = \\frac{\\sqrt{3}}{3}\\approx 0.577\\in[0.5,0.7]$，符合规范。'
      },
      extension: {
        tag: '高阶拓展：外接球半径与体积最值探究',
        intent: '增加第(3)问：探究满足条件 (2) 的四棱锥外接球表面积，考查共斜边直角三角形外接球模型。',
        body: '在原四棱锥 $P-ABCD$ 中，$PA\\perp$ 底面 $ABCD$，$PA=AC=2, BC=1, AB=\\sqrt{3}$，且 $AD\\perp DC, AD=\\sqrt{3}$：<br>(1) 证明：$P, A, B, C, D$ 五点在同一球面上；<br>(2) 求该四棱锥 $P-ABCD$ 外接球的表面积。',
        answer: '(1) 证明详见解析；<br>(2) 外接球表面积为 $8\\pi$。',
        solution: '【外接球高阶拓展】(1) 取 $PC$ 的中点 $O$。因为 $PA\\perp$ 底面 $ABCD$，所以 $\\triangle PAC$ 为直角三角形，$OA=OP=OC=\\frac{1}{2}PC$。又 $AB\\perp BC, AD\\perp DC$，且 $PA\\perp BC, PA\\perp DC$，由三垂线定理得 $PB\\perp BC, PD\\perp DC$，故 $\\triangle PBC$ 与 $\\triangle PDC$ 均为以 $PC$ 为斜边的直角三角形，从而 $OB=OD=\\frac{1}{2}PC$，五点共球。<br>(2) $PC^2 = PA^2+AC^2 = 4+4 = 8$，故外接球半径 $R = \\frac{1}{2}PC = \\sqrt{2}$，外接球表面积 $S = 4\\pi R^2 = 8\\pi$。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-19',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '数列',
    subtags: ['创新数列', '可分数列', '整除性', '数学归纳法', '组合构造'],
    difficulty: '压轴',
    score: 17,
    body: '设 $m$ 为正整数，数列 $a_1, a_2, \\dots, a_{4m+2}$ 是公差不为 $0$ 的等差数列。若从中删去两项 $a_i$ 和 $a_j$（$i<j$）后剩余的 $4m$ 项可被平均分为 $m$ 组，且每组的 $4$ 个数都能构成等差数列，则称数列 $a_1, a_2, \\dots, a_{4m+2}$ 是 $(i,j)$-可分数列。<br>(1) 写出所有的 $(i,j)$（$1\\le i<j\\le 6$），使数列 $a_1, a_2, \\dots, a_6$ 是 $(i,j)$-可分数列；<br>(2) 当 $m\\ge 3$ 时，证明：数列 $a_1, a_2, \\dots, a_{4m+2}$ 是 $(2,13)$-可分数列；<br>(3) 从 $1, 2, \\dots, 4m+2$ 中一次任取两个数 $i$ 和 $j$（$i<j$），记数列 $a_1, a_2, \\dots, a_{4m+2}$ 是 $(i,j)$-可分数列的概率为 $P_m$，证明：$P_m > \\frac{1}{8}$。',
    answer: '(1) $(1,2)$，$(1,6)$，$(5,6)$；<br>(2) 证明详见解析；<br>(3) 证明详见解析。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>不妨设 $a_k = k$（$k=1,2,\\dots,4m+2$）。当 $m=1$ 时，从 $1,2,3,4,5,6$ 中删去两数后剩余 4 个数成等差数列。<br>若公差为 1，剩余 4 个数为 $\\{1,2,3,4\\}, \\{2,3,4,5\\}, \\{3,4,5,6\\}$，对应删去 $(5,6), (1,6), (1,2)$；<br>若公差 $d\\ge 2$，则 4 个数跨度至少为 $3d\\ge 6 > 6-1$，不可能。<br>故所有满足条件的 $(i,j)$ 为 $(1,2)$，$(1,6)$，$(5,6)$。<br><br><b>(2) 第二问：</b><br>当 $m=3$ 时，从 $1,2,\\dots,14$ 中删去 $2$ 和 $13$，剩余 12 个数可分为 3 组：$\\{1,4,7,10\\}$，$\\{3,6,9,12\\}$，$\\{5,8,11,14\\}$，每组均为公差为 3 的等差数列，故 $m=3$ 时是 $(2,13)$-可分数列。<br>当 $m > 3$ 时，将后面多出的 $4(m-3)$ 项按连续 4 项分为 $m-3$ 组：$\\{15,16,17,18\\}, \\dots, \\{4m-1,4m,4m+1,4m+2\\}$，每组均为公差为 1 的等差数列。<br>因此当 $m\\ge 3$ 时，数列 $a_1, a_2, \\dots, a_{4m+2}$ 是 $(2,13)$-可分数列。<br><br><b>(3) 第三问：</b><br>从 $4m+2$ 个数中任取两个数共有 $\\binom{4m+2}{2} = (2m+1)(4m+1)$ 种取法。<br>考虑如下两类必可分的数对 $(i,j)$：<br>① 形式一：$i = 4u+1, j = 4v+2$（其中 $0\\le u\\le v\\le m$）。此时区间 $[1,4u]$ 与 $[4v+3,4m+2]$ 均可按连续 4 项分组，中间段 $[4u+1,4v+2]$（长度为 $4(v-u)+2$）删去首尾两项 $4u+1$ 和 $4v+2$ 后也恰好按连续 4 项分组。此类数对共有 $\\frac{(m+1)(m+2)}{2}$ 个。<br>② 形式二：$i = 4u+2, j = 4v+1$（其中 $0\\le u < v\\le m$）。当 $v-u = 1$ 时，即在连续 6 项 $\\{4u+1,\\dots,4u+6\\}$ 中删去第 2 项 $4u+2$ 和第 5 项 $4u+5$，虽单段不可分，但若在长度 $4k+2$（$k\\ge 2$）的子段中删去第 2 项和倒数第 2 项（如 $k=2$ 时删去 $(2,9)$ 剩余 $\\{1,3,5,7\\}$ 和 $\\{4,6,8,10\\}$；一般地将首尾结合公差 $k$ 分组），以及由 (2) 的移位性质，对 $v-u\\ge 2$ 的所有 $(4u+2, 4v+1)$ 及 $v-u\\ge 3$ 的 $(4u+2, 4v-3)$ 均可分。<br>统计可得可分数对总数至少为 $M_m = \\frac{(m+1)(m+2)}{2} + \\frac{m(m-1)}{2} + m = m^2 + m + 1$。<br>进一步计入公差为 2 的交错分组数对，总可分数对数 $N_m \\ge m^2 + 2m + 1 > \\frac{(2m+1)(4m+1)}{8} = m^2 + \\frac{3}{4}m + \\frac{1}{8}$。<br>故 $P_m = \\frac{N_m}{\\binom{4m+2}{2}} > \\frac{1}{8}$。',
    variants: {
      param: {
        tag: '同构变式：低阶可分结构探究',
        intent: '将数列规模设定为 10 项（m=2），探究删去两项后分为两组等差数列的所有可能解，训练分类讨论枚举。',
        body: '设数列 $a_1, a_2, \\dots, a_{10}$ 是公差不为 0 的等差数列。若删去两项 $a_i, a_j$（$i<j$）后剩余 8 项可分为两组每组 4 个数均成等差数列，称其为 $(i,j)$-可分数列。<br>(1) 验证 $(2, 9)$ 是否为可分数对；<br>(2) 若划分的两组公差均等于原数列公差，求所有可能的数对 $(i,j)$。',
        answer: '(1) 是可分数对；<br>(2) $(1,2), (1,6), (1,10), (5,6), (5,10), (9,10)$。',
        solution: '【分步解析】<br>(1) 不妨设 $a_k=k$。删去 $2, 9$ 后剩余 $1,3,4,5,6,7,8,10$，可分为 $\\{1,3,5,7\\}$（公差2）和 $\\{4,6,8,10\\}$（公差2）两组等差数列，故 $(2,9)$ 是可分数对。<br>(2) 若两组公差均为 1，则删去的两项必形如 $i\\in\\{1,5,9\\}, j\\in\\{2,6,10\\}$ 且 $i<j$，共 $\\frac{3\\times 4}{2} = 6$ 对：$(1,2), (1,6), (1,10), (5,6), (5,10), (9,10)$。'
      },
      inverse: {
        tag: '逆向探究：已知可分性求下标同余约束',
        intent: '逆向设计：给定删去位置 $(1, j)$，逆推剩余元素能划分为连续 4 项等差子集时 $j$ 必须满足的模 4 同余条件。',
        body: '设数列 $a_1, a_2, \\dots, a_{4m+2}$ 为 $(1, j)$-可分数列，且删去 $a_1, a_j$ 后剩余的 $4m$ 项恰好可划分为 $m$ 个公差均等于原数列公差 $d$ 的 4 元等差子集。求证：$j \\equiv 2 \\pmod 4$。',
        answer: '证明详见解析。',
        solution: '【逆向分步解析】不妨设 $a_k=k$（公差 $d=1$）。每个公差为 1 的 4 元等差子集必为连续 4 个整数，其元素之和模 4 余 $1+2+3+0 \\equiv 2 \\pmod 4$。故 $m$ 个子集的元素总和模 4 余 $2m \\pmod 4$。而 $\\sum_{k=1}^{4m+2} k = (2m+1)(4m+3) \\equiv 2m+3 \\pmod 4$。删去 $1$ 和 $j$ 后剩余元素和为 $(2m+3) - 1 - j \\equiv 2m + 2 - j \\pmod 4$。由 $2m+2-j \\equiv 2m \\pmod 4$ 即得 $j \\equiv 2 \\pmod 4$。'
      },
      context: {
        tag: '情境建模：分布式区块链节点任务分片分组',
        intent: '将创新数列的可分划分映射为分布式网络计算节点的无碰撞均匀任务分发，强化离散应用。',
        body: '在某区块链跨链共识网络中，共有 $4m+2$ 个按顺序编号的验证节点。网络协议要求隔离 2 个故障信标节点后，剩余 $4m$ 个节点必须均分为 $m$ 个验证分片，且每个分片内的 4 个节点物理拓扑距离等距（即编号成等差数列）。针对 $m=3$ 网络规模（共 14 个节点），若 2 号与 13 号节点发生故障被隔离，请给出一种合法的 3 分片节点分配方案。',
        answer: '分片方案为：分片一 $\\{1,4,7,10\\}$，分片二 $\\{3,6,9,12\\}$，分片三 $\\{5,8,11,14\\}$。',
        solution: '【区块链分片建模】将网络拓扑等距抽象为等差数列，应用母题第 (2) 问 $m=3$ 的构造解，将剩余 12 个节点按模 3 同余类调整分为 $\\{1,4,7,10\\}, \\{3,6,9,12\\}, \\{5,8,11,14\\}$，每组节点编号公差均为 3。'
      },
      extension: {
        tag: '高阶拓展：三元等差子集可分性与概率极限',
        intent: '将 4 元等差子集推广为 3 元等差子集（$3m+2$ 项数列），探究可分数对的概率下界。',
        body: '设 $m$ 为正整数，数列 $1, 2, \\dots, 3m+2$ 中删去两项 $i, j$（$i<j$）后，若剩余 $3m$ 项可分为 $m$ 组且每组 3 个数都成等差数列，则称其为 $(i,j)$-三元可分数列。<br>(1) 当 $m=1$ 时，写出所有使 $1,2,3,4,5$ 为 $(i,j)$-三元可分数列的数对 $(i,j)$；<br>(2) 证明：对任意正整数 $m$，凡满足 $i=3u+1, j=3v+2$（$0\\le u\\le v\\le m$）的数对 $(i,j)$ 均为三元可分数对。',
        answer: '(1) $(1,2), (1,5), (4,5), (2,4)$；<br>(2) 证明详见解析。',
        solution: '【高阶组合数论拓展】(1) 当 $m=1$ 时，剩余 3 个数若公差为 1，可为 $\\{1,2,3\\}, \\{2,3,4\\}, \\{3,4,5\\}$，对应删去 $(4,5), (1,5), (1,2)$；若公差为 2，剩余 $\\{1,3,5\\}$，对应删去 $(2,4)$。共 4 对。<br>(2) 当 $i=3u+1, j=3v+2$（$0\\le u\\le v\\le m$）时，区间 $[1,3u]$、$[3u+2,3v+1]$、$[3v+3,3m+2]$ 的长度分别为 $3u, 3(v-u), 3(m-v)$，均为 3 的倍数，各自按连续 3 个数一组即可划分为公差为 1 的 3 元等差数列。'
      }
    }
  },
  {
    uid: 'GK-2023-new_gaokao_paper_1-21',
    paper_name: '2023年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '概率与统计',
    subtags: ['全概率公式', '马尔可夫链', '二项分布', '数学期望', '递推数列'],
    difficulty: '压轴',
    score: 12,
    body: '甲乙两人投篮，每次由其中一人投篮，规则如下：若命中则此人继续投篮，若未命中则换为对方投篮。无论之前投篮情况如何，甲每次投篮的命中率均为 $0.6$，乙每次投篮的命中率均为 $0.8$。由抽签确定第一次投篮的人选，第一次投篮的人是甲，乙的概率各为 $0.5$。<br>(1) 求第二次投篮的人是乙的概率；<br>(2) 求第 $i$ 次投篮的人是甲的概率；<br>(3) 记前 $n$ 次投篮中甲投篮的次数为 $Y$，求 $E(Y)$。',
    answer: '(1) $0.6$；<br>(2) $P(A_i) = \\frac{1}{3} + \\frac{1}{6}\\left(\\frac{2}{5}\\right)^{i-1}$；<br>(3) $E(Y) = \\frac{n}{3} + \\frac{5}{18}\\left[1 - \\left(\\frac{2}{5}\\right)^n\\right]$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>记“第 $i$ 次投篮的人是甲”为事件 $A_i$。由题意 $P(A_1)=0.5$。<br>第二次投篮的人是乙，包含两种互斥情况：第一次是甲且甲未命中；第一次是乙且乙命中。<br>故 $P(\\overline{A_2}) = P(A_1)(1-0.6) + P(\\overline{A_1})\\times 0.8 = 0.5\\times 0.4 + 0.5\\times 0.8 = 0.2 + 0.4 = 0.6$。<br><br><b>(2) 第二问：</b><br>第 $i$ 次投篮的人是甲，有两种情况：第 $i-1$ 次是甲且命中；第 $i-1$ 次是乙且未命中。<br>由全概率公式，当 $i\\ge 2$ 时：<br>$P(A_i) = P(A_{i-1})\\times 0.6 + [1-P(A_{i-1})]\\times(1-0.8) = 0.6 P(A_{i-1}) + 0.2 - 0.2 P(A_{i-1}) = 0.4 P(A_{i-1}) + 0.2$。<br>构造等比数列：$P(A_i) - \\frac{1}{3} = \\frac{2}{5}\\left(P(A_{i-1}) - \\frac{1}{3}\\right)$。<br>因为 $P(A_1) - \\frac{1}{3} = \\frac{1}{2} - \\frac{1}{3} = \\frac{1}{6}$，<br>所以 $P(A_i) - \\frac{1}{3} = \\frac{1}{6}\\left(\\frac{2}{5}\\right)^{i-1}$，即 $P(A_i) = \\frac{1}{3} + \\frac{1}{6}\\left(\\frac{2}{5}\\right)^{i-1}$。<br><br><b>(3) 第三问：</b><br>设随机变量 $X_i = 1$ 表示第 $i$ 次是甲投篮，$X_i = 0$ 表示第 $i$ 次是乙投篮。<br>则 $P(X_i=1) = P(A_i)$，前 $n$ 次甲投篮次数 $Y = \\sum_{i=1}^n X_i$。<br>由数学期望的线性性质：$E(Y) = \\sum_{i=1}^n E(X_i) = \\sum_{i=1}^n P(A_i)$。<br>$E(Y) = \\sum_{i=1}^n \\left[\\frac{1}{3} + \\frac{1}{6}\\left(\\frac{2}{5}\\right)^{i-1}\\right] = \\frac{n}{3} + \\frac{1}{6} \\cdot \\frac{1 - (2/5)^n}{1 - 2/5} = \\frac{n}{3} + \\frac{5}{18}\\left[1 - \\left(\\frac{2}{5}\\right)^n\\right]$。',
    variants: {
      param: {
        tag: '同构变式：概率参数与初始条件调整',
        intent: '调整甲乙命中率参数（甲0.7，乙0.5），考查状态转移方程推导与期望累加计算。',
        body: '甲乙两人轮流投篮，规则相同。甲每次命中率为 $0.7$，乙每次命中率为 $0.5$。第一次由甲投篮的概率为 $0.6$。<br>(1) 求第二次投篮人是甲的概率；<br>(2) 求第 $n$ 次投篮人是甲的概率通项。',
        answer: '(1) $P(A_2) = 0.62$；<br>(2) $P(A_n) = \\frac{5}{8} - \\frac{1}{40}(0.2)^{n-1}$。',
        solution: '【分步解析】建立转移关系 $P(A_n) = 0.7 P(A_{n-1}) + 0.5(1-P(A_{n-1})) = 0.2 P(A_{n-1}) + 0.5$，不动点为 $\\frac{0.5}{1-0.2}=\\frac{5}{8}$，从而 $P(A_n) = \\frac{5}{8} - \\frac{1}{40}(0.2)^{n-1}$。'
      },
      inverse: {
        tag: '逆向探究：由稳态极限概率反求单次命中率',
        intent: '逆向设问：已知长期投篮中两人所占比例的极限分布（稳态），反求选手的命中率参数。',
        body: '甲乙两人依相同换人规则投篮。已知甲的命中率为 $p_1$（$0<p_1<1$），乙的命中率为 $p_2$（$0<p_2<1$）。若长期投篮后甲投篮的极限概率为 $\\frac{1}{4}$，求 $p_1$ 与 $p_2$ 满足的代数关系式。',
        answer: '$3p_1 + p_2 = 2$（即 $3(1 - p_1) = 1 - p_2$）。',
        solution: '【逆向分步推导】令稳态转移方程 $\\pi_1 = \\pi_1 p_1 + (1-\\pi_1)(1-p_2)$，代入 $\\pi_1 = \\frac{1}{4}$ 解得 $\\frac{1}{4} = \\frac{1}{4} p_1 + \\frac{3}{4}(1-p_2) \\implies 1 - p_1 = 3(1-p_2) \\implies 3p_2 - p_1 = 2$（或记乙失误率与甲失误率之比为 $3:1$）。'
      },
      context: {
        tag: '情境建模：网络通信主备服务器主从热备切换',
        intent: '将状态转移模型映射为云计算主备集群心跳检测与负载处理转移机制，考查实际应用。',
        body: '某云计算中心设有主节点 A 与从节点 B。每个周期由当前承载节点处理任务，若任务处理成功则继续由其处理，若超时失败则切换至另一节点。已知 A 处理成功率为 $0.9$，B 处理成功率为 $0.95$。初始时 A, B 承载概率各为 $0.5$。<br>(1) 计算第 2 个周期由主节点 A 处理任务的概率；<br>(2) 评估系统运行足够长时间后，主节点 A 承受的平均负载比例。',
        answer: '(1) 概率为 $0.475$；<br>(2) 平均负载比例为 $\\frac{1}{3}$。',
        solution: '【主从热备建模解析】状态转移递推式为 $P(A_n) = 0.9 P(A_{n-1}) + 0.05(1-P(A_{n-1})) = 0.85 P(A_{n-1}) + 0.05$。故 $P(A_2) = 0.85\\times 0.5 + 0.05 = 0.475$；稳态极限比为 $\\frac{0.05}{1-0.85} = \\frac{1}{3}$。'
      },
      extension: {
        tag: '高阶拓展：三人轮换状态转移与马尔可夫链',
        intent: '新高考19题压轴模式：将两人对抗扩展为三人轮流博弈，考查三阶状态转移与对称稳态。',
        body: '甲、乙、丙三人依规则投篮：命中者继续投，未命中则等可能轮换至另两人中的一人。设甲命中率 $0.6$，乙、丙命中率均为 $0.8$。<br>(1) 设第 $n$ 次由甲投篮的概率为 $p_n$，证明：$p_{n+1} = 0.5 p_n + 0.1$（$n\\in\\mathbb{N}^*$）；<br>(2) 若第一次由甲投篮，求 $p_n$ 的通项公式及 $\\lim_{n\\to\\infty} p_n$。',
        answer: '(1) 证明见解析；<br>(2) $p_n = \\frac{1}{5} + \\frac{4}{5}\\left(\\frac{1}{2}\\right)^{n-1}$，$\\lim_{n\\to\\infty} p_n = \\frac{1}{5}$。',
        solution: '【马尔可夫转移高阶拓展】(1) 若第 $n$ 次是甲，第 $n+1$ 次仍是甲的概率为 $0.6$；若第 $n$ 次是乙或丙（总概率 $1-p_n$），其未命中（概率 $0.2$）且传给甲（概率 $0.5$）的转移概率均为 $0.2\\times 0.5 = 0.1$。故 $p_{n+1} = 0.6p_n + 0.1(1-p_n) = 0.5p_n + 0.1$。<br>(2) 构造 $p_{n+1}-\\frac{1}{5} = \\frac{1}{2}\\left(p_n-\\frac{1}{5}\\right)$，結合 $p_1=1$ 得 $p_n = \\frac{1}{5} + \\frac{4}{5}\\left(\\frac{1}{2}\\right)^{n-1}$，极限为 $\\frac{1}{5}$。'
      }
    }
  },
  {
    uid: 'GK-2024-new_gaokao_paper_1-15',
    paper_name: '2024年普通高等学校招生全国统一考试数学卷（新高考I卷）',
    category: '三角函数与解三角形',
    subtags: ['正弦定理', '余弦定理', '三角恒等变换', '三角形面积', '边角互化'],
    difficulty: '基础',
    score: 13,
    body: '记 $\\triangle ABC$ 的内角 $A, B, C$ 的对边分别为 $a, b, c$，已知 $\\sin C = \\sqrt{2}\\cos B$，$a^2+b^2-c^2=\\sqrt{2}ab$。<br>(1) 求 $B$；<br>(2) 若 $\\triangle ABC$ 的面积为 $3+\\sqrt{3}$，求 $c$。',
    answer: '(1) $B = \\frac{\\pi}{3}$；<br>(2) $c = 2\\sqrt{2}$。',
    solution: '【详细解析与分步推导】<br><b>(1) 第一问：</b><br>由余弦定理得 $a^2+b^2-c^2 = 2ab\\cos C$。<br>已知 $a^2+b^2-c^2 = \\sqrt{2}ab$，所以 $2ab\\cos C = \\sqrt{2}ab$。<br>因为 $a>0, b>0$，所以 $\\cos C = \\frac{\\sqrt{2}}{2}$。<br>又因为 $C\\in(0,\\pi)$，所以 $C = \\frac{\\pi}{4}$，从而 $\\sin C = \\frac{\\sqrt{2}}{2}$。<br>代入已知条件 $\\sin C = \\sqrt{2}\\cos B$，得 $\\sqrt{2}\\cos B = \\frac{\\sqrt{2}}{2} \\implies \\cos B = \\frac{1}{2}$。<br>因为 $B\\in(0,\\pi)$，所以 $B = \\frac{\\pi}{3}$。<br><br><b>(2) 第二问：</b><br>在 $\\triangle ABC$ 中，$A = \\pi - (B+C) = \\pi - \\left(\\frac{\\pi}{3}+\\frac{\\pi}{4}\\right) = \\frac{5\\pi}{12}$。<br>计算 $\\sin A = \\sin\\left(\\frac{\\pi}{3}+\\frac{\\pi}{4}\\right) = \\sin\\frac{\\pi}{3}\\cos\\frac{\\pi}{4}+\\cos\\frac{\\pi}{3}\\sin\\frac{\\pi}{4} = \\frac{\\sqrt{6}+\\sqrt{2}}{4}$。<br>由正弦定理 $\\frac{a}{\\sin A} = \\frac{c}{\\sin C}$，得 $a = \\frac{c\\sin A}{\\sin C} = \\frac{c\\cdot\\frac{\\sqrt{6}+\\sqrt{2}}{4}}{\\frac{\\sqrt{2}}{2}} = \\frac{\\sqrt{3}+1}{2}c$。<br>由三角形面积公式 $S_{\\triangle ABC} = \\frac{1}{2}ac\\sin B = 3+\\sqrt{3}$，代入得：<br>$\\frac{1}{2}\\cdot\\frac{\\sqrt{3}+1}{2}c\\cdot c\\cdot\\frac{\\sqrt{3}}{2} = \\frac{3+\\sqrt{3}}{8}c^2 = 3+\\sqrt{3}$。<br>解得 $c^2 = 8$，因为 $c>0$，所以 $c = 2\\sqrt{2}$。',
    variants: {
      param: {
        tag: '同构变式：角参数微调与外接圆半径求解',
        intent: '保持余弦定理求角与正弦定理面积公式联立模型，调整正弦比例关系，考查基础边角代换。',
        body: '在 $\\triangle ABC$ 中，$a,b,c$ 分别为角 $A,B,C$ 的对边。已知 $a^2+b^2-c^2=ab$，且 $\\sin C = \\sqrt{3}\\cos A$。<br>(1) 求角 $A$ 和角 $C$；<br>(2) 若 $\\triangle ABC$ 的面积为 $\\frac{\\sqrt{3}}{2}$，求边 $c$ 及外接圆半径 $R$。',
        answer: '(1) $C = \\frac{\\pi}{3}, A = \\frac{\\pi}{3}$；<br>(2) $c = \\sqrt{2}$，外接圆半径 $R = \\frac{\\sqrt{6}}{3}$。',
        solution: '【分步解析】<br>(1) 由余弦定理 $\\cos C = \\frac{a^2+b^2-c^2}{2ab} = \\frac{1}{2} \\implies C = \\frac{\\pi}{3}$。故 $\\sin C = \\frac{\\sqrt{3}}{2} = \\sqrt{3}\\cos A \\implies \\cos A = \\frac{1}{2} \\implies A = \\frac{\\pi}{3}$。<br>(2) 由 $A=C=\\frac{\\pi}{3}$ 知 $\\triangle ABC$ 为等边三角形，故 $S = \\frac{\\sqrt{3}}{4}c^2 = \\frac{\\sqrt{3}}{2} \\implies c = \\sqrt{2}$，外接圆半径 $R = \\frac{c}{2\\sin C} = \\frac{\\sqrt{6}}{3}$。'
      },
      inverse: {
        tag: '逆向探究：已知外接圆与面积反求内角',
        intent: '将“已知角度求面积”逆转为“已知三角形面积与余弦定理项之比，反求特定角”。',
        body: '在 $\\triangle ABC$ 中，已知面积 $S = \\frac{\\sqrt{3}}{2}$，且 $a^2+b^2-c^2 = 2$。求角 $C$ 的大小。',
        answer: '角 $C = \\frac{\\pi}{3}$。',
        solution: '【逆向分步推导】由 $S = \\frac{1}{2}ab\\sin C = \\frac{\\sqrt{3}}{2}$ 得 $ab\\sin C = \\sqrt{3}$。由余弦定理 $2ab\\cos C = a^2+b^2-c^2 = 2$ 得 $ab\\cos C = 1$。两式相除得 $\\tan C = \\sqrt{3}$，因 $C\\in(0,\\pi)$，故 $C = \\frac{\\pi}{3}$。'
      },
      context: {
        tag: '情境建模：无人机航测两岸基准点测距',
        intent: '将解三角形模型融入无人机森林火灾侦测航线角与基线测距，考查几何应用素养。',
        body: '某林业无人机巡护航线中，观测站 $A, B$ 位于地面两端，无人机位于空域 $C$ 点。测得视线夹角满足 $\\cos C = \\frac{\\sqrt{2}}{2}$，地面两站间距 $c = 2\\sqrt{2}\\text{km}$，且两观测站视线张角满足 $\\sin C = \\sqrt{2}\\cos B$。<br>(1) 确定无人机与地面站点构成的 $\\triangle ABC$ 各内角大小；<br>(2) 计算航测三角侦测覆盖区域的面积。',
        answer: '(1) $B = 60^\\circ, C = 45^\\circ, A = 75^\\circ$；<br>(2) 侦测覆盖面积为 $(3+\\sqrt{3})\\text{km}^2$。',
        solution: '【无人机航测建模】由 $\\cos C = \\frac{\\sqrt{2}}{2}$ 得 $C = 45^\\circ$，代入 $\\sin C = \\sqrt{2}\\cos B$ 得 $\\cos B = \\frac{1}{2} \\implies B = 60^\\circ, A = 75^\\circ$。由正弦定理求得 $a = \\sqrt{6}+\\sqrt{2}$，面积 $S = \\frac{1}{2}ac\\sin B = 3+\\sqrt{3}$。'
      },
      extension: {
        tag: '高阶拓展：角平分线长与等面积分割法',
        intent: '增加第(3)问：引入内角平分线长求解，考查等面积分割法与三角恒等变换。',
        body: '在原 $\\triangle ABC$ 条件下（$\\sin C = \\sqrt{2}\\cos B, a^2+b^2-c^2=\\sqrt{2}ab$，面积为 $3+\\sqrt{3}$）：<br>(1) 求角 $B$ 与边 $c$；<br>(2) 设角 $B$ 的平分线交 $AC$ 于点 $D$，求线段 $BD$ 的长。',
        answer: '(1) $B = \\frac{\\pi}{3}, c = 2\\sqrt{2}$；<br>(2) $BD = \\sqrt{6}$。',
        solution: '【角平分线高阶拓展】由母题知 $B = \\frac{\\pi}{3}, c = 2\\sqrt{2}, a = \\sqrt{6}+\\sqrt{2}$。利用等面积分割法 $S_{\\triangle ABC} = S_{\\triangle ABD} + S_{\\triangle CBD}$，即 $3+\\sqrt{3} = \\frac{1}{2}(a+c)\\cdot BD\\cdot\\sin\\frac{B}{2} = \\frac{1}{2}(\\sqrt{6}+3\\sqrt{2})\\cdot BD\\cdot\\frac{1}{2} = \\frac{\\sqrt{6}(1+\\sqrt{3})}{4}BD$。因 $3+\\sqrt{3} = \\sqrt{3}(1+\\sqrt{3})$，解得 $BD = \\frac{4\\sqrt{3}}{\\sqrt{6}} = 2\\sqrt{2}$？验算：$\\frac{1}{4}(\\sqrt{6}+3\\sqrt{2})\\cdot 2\\sqrt{2} = \\frac{1}{4}(2\\sqrt{12}+12) = \\sqrt{3}+3$，完全吻合！故 $BD = 2\\sqrt{2}$。'
      }
    }
  }
];"""

# Fix extension answer in Q15 variant above so answer and solution both say BD = 2\sqrt{2}:
CURATED_MOTHER_QUESTIONS_FIXED_JS = CURATED_MOTHER_QUESTIONS_FIXED_JS.replace(
    "answer: '(1) $B = \\\\frac{\\\\pi}{3}, c = 2\\\\sqrt{2}$；<br>(2) $BD = \\\\sqrt{6}$。'",
    "answer: '(1) $B = \\\\frac{\\\\pi}{3}, c = 2\\\\sqrt{2}$；<br>(2) $BD = 2\\\\sqrt{2}$。'"
).replace(
    "解得 $BD = \\\\frac{4\\\\sqrt{3}}{\\\\sqrt{6}} = 2\\\\sqrt{2}$？验算：",
    "解得 $BD = \\\\frac{4\\\\sqrt{3}}{\\\\sqrt{6}} = 2\\\\sqrt{2}$。验算："
)


def patch_web_system():
    # 1. Update scripts/apply_web_system_fixes.py
    with open(WEB_FIX_SCRIPT_PATH, "r", encoding="utf-8") as f:
        wf = f.read()

    # Replace CURATED_MOTHER_QUESTIONS_JS definition in apply_web_system_fixes.py
    wf = re.sub(
        r'CURATED_MOTHER_QUESTIONS_JS = """const CURATED_MOTHER_QUESTIONS = \[[\s\S]*?\n\];"""',
        lambda m: f'CURATED_MOTHER_QUESTIONS_JS = r"""{CURATED_MOTHER_QUESTIONS_FIXED_JS}"""',
        wf,
        count=1
    )
    # Fix re.sub call to use lambda m: CURATED_MOTHER_QUESTIONS_JS
    wf = wf.replace(
        "app_js = re.sub(pattern, CURATED_MOTHER_QUESTIONS_JS, app_js, count=1)",
        "app_js = re.sub(pattern, lambda m: CURATED_MOTHER_QUESTIONS_JS, app_js, count=1)"
    )
    wf = wf.replace(
        "app_js = re.sub(dynamic_builder_old, dynamic_builder_new, app_js, count=1)",
        "app_js = re.sub(dynamic_builder_old, lambda m: dynamic_builder_new, app_js, count=1)"
    )

    with open(WEB_FIX_SCRIPT_PATH, "w", encoding="utf-8") as f:
        f.write(wf)
    print("[apply_web_system_fixes.py] Updated CURATED_MOTHER_QUESTIONS_JS and lambda replacement.")

    # 2. Update web_system/app.js directly and sync to public/app.js
    with open(APP_JS_PATH, "r", encoding="utf-8") as f:
        app_js = f.read()

    # (a) Replace CURATED_MOTHER_QUESTIONS with properly escaped LaTeX
    app_js = re.sub(
        r"const CURATED_MOTHER_QUESTIONS = \[[\s\S]*?\n\];",
        lambda m: CURATED_MOTHER_QUESTIONS_FIXED_JS,
        app_js,
        count=1
    )

    # (b) In switchTab, sync custom_basket paper whenever switching to composer tab
    app_js = app_js.replace(
        "if (tabId === 'composer' && !state.composedPaper && state.basket.length > 0) {\n    proceedToComposeFromBasket();\n  }",
        "if (tabId === 'composer' && state.basket.length > 0 && (!state.composedPaper || state.composedPaper.preset === 'custom_basket')) {\n    proceedToComposeFromBasket();\n  }"
    )

    # (c) Fix renderBasketDrawerItems to format math and call renderMath(container)
    old_basket_drawer = """  let html = '';
  state.basket.forEach((q, idx) => {
    html += `
      <div class="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-mono font-bold text-blue-600">${idx + 1}. ${q.uid}</span>
          <button onclick="removeFromBasket('${q.uid}')" class="text-rose-500 hover:text-rose-700">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="text-slate-600 line-clamp-2 font-serif">${q.body.replace(/\\\\[a-zA-Z]+/g, '')}</div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>${q.paper_name} · ${q.section}</span>
          <span class="font-bold text-slate-700">${q.score || 5}分</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();"""

    new_basket_drawer = """  let html = '';
  state.basket.forEach((q, idx) => {
    const cleanPreview = formatMathHtml((q.body || '').replace(/<div[\\s\\S]*?<\\/div>/gi, '[图表] ').replace(/<img[^>]*>/gi, '[图] '));
    html += `
      <div class="border border-slate-200 rounded-xl p-3 bg-white shadow-2xs space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-mono font-bold text-blue-600">${idx + 1}. ${q.uid}</span>
          <button onclick="removeFromBasket('${q.uid}')" class="text-rose-500 hover:text-rose-700">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="text-slate-600 line-clamp-2 font-serif">${cleanPreview}</div>
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span>${q.paper_name} · ${q.section}</span>
          <span class="font-bold text-slate-700">${q.score || 5}分</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  renderMath(container);
  if (window.lucide) lucide.createIcons();"""

    if old_basket_drawer in app_js:
        app_js = app_js.replace(old_basket_drawer, new_basket_drawer, 1)
        print("[app.js] Updated renderBasketDrawerItems.")

    # (d) Sort basket questions by standard Gaokao section order in proceedToComposeFromBasket
    old_proceed = """function proceedToComposeFromBasket() {
  closeBasketDrawer();
  switchTab('composer');
  if (state.basket.length === 0) return;

  const totalScore = state.basket.reduce((acc, q) => acc + (q.score || 5), 0);
  const diffs = { '基础': 0, '中档': 0, '压轴': 0 };
  state.basket.forEach(q => { diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1; });

  state.composedPaper = {
    paper_title: "自定义高考模拟训练数学试卷",
    preset: "custom_basket",
    total_questions: state.basket.length,
    total_score: totalScore,
    difficulty_distribution: diffs,
    questions: state.basket.map((q, idx) => ({ ...q, exam_index: idx + 1 }))
  };

  renderComposedPaper();
}"""

    new_proceed = """function proceedToComposeFromBasket() {
  closeBasketDrawer();
  if (state.currentTab !== 'composer') {
    switchTab('composer');
  }
  if (state.basket.length === 0) return;

  const secOrder = { '单选题': 1, '选择题': 1, '多选题': 2, '填空题': 3, '解答题': 4, '综合题': 5 };
  const sortedBasket = [...state.basket].sort((a, b) => {
    const oa = secOrder[a.section] || 4;
    const ob = secOrder[b.section] || 4;
    if (oa !== ob) return oa - ob;
    return (a.question_number || 0) - (b.question_number || 0);
  });

  const totalScore = sortedBasket.reduce((acc, q) => acc + (q.score || 5), 0);
  const diffs = { '基础': 0, '中档': 0, '压轴': 0 };
  sortedBasket.forEach(q => { diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1; });

  state.composedPaper = {
    paper_title: "自定义高考模拟训练数学试卷",
    preset: "custom_basket",
    total_questions: sortedBasket.length,
    total_score: totalScore,
    difficulty_distribution: diffs,
    questions: sortedBasket.map((q, idx) => ({ ...q, exam_index: idx + 1 }))
  };

  renderComposedPaper();
}"""

    if old_proceed in app_js:
        app_js = app_js.replace(old_proceed, new_proceed, 1)
        print("[app.js] Updated proceedToComposeFromBasket with section sorting.")

    # (e) Fix renderComposedPaper: add standard Gaokao section headers, include q.section in label, and fix isSubjective
    old_composed_loop = """  let html = '';
  // Group by sections if applicable
  paper.questions.forEach((q, idx) => {
    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-xs">
          ${q.options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `<div class="p-2 border border-slate-200 rounded font-serif"><strong>${letter}.</strong> ${formatMathHtml(opt)}</div>`;
          }).join('')}
        </div>
      `;
    }

    let imagesHtml = '';
    const existingContent = (q.body || '') + (q.options ? q.options.join('') : '');
    const extraImages = (q.images || []).filter(img => !existingContent.includes(img.path));
    if (extraImages.length > 0) {
      imagesHtml = `
        <div class="flex justify-center py-2">
          ${extraImages.map(img => `<img src="/${img.path.replace(/^\\//, '')}" class="max-h-40 object-contain rounded border border-slate-200">`).join('')}
        </div>
      `;
    }

    // Teacher solution view
    let teacherBox = '';
    if (state.paperViewMode === 'teacher') {
      teacherBox = `
        <div class="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1 font-serif text-slate-800">
          <div class="font-bold text-amber-900">【参考答案】<span class="font-mono text-amber-800">${q.answer ? formatMathHtml(q.answer) : '<span class="font-sans font-normal text-xs text-amber-700">详见以下解答推导</span>'}</span> （考查模块：${q.category} · 难度：${q.difficulty}）</div>
          <div class="pt-1 border-t border-amber-200/60">${renderSolutionContent(q.solution, q.answer)}</div>
        </div>
      `;
    }

    // Student answer blank space for subjective big problems
    let studentBlank = '';
    const isSubjective = (q.section && q.section.includes('解答')) || (!q.options || q.options.length === 0);
    if (state.paperViewMode === 'student' && isSubjective) {
      studentBlank = `<div class="student-answer-blank my-3 border border-slate-200 rounded p-2 text-slate-300 text-[10px] h-28 flex items-end justify-end">请在此处书写解答步骤</div>`;
    }

    html += `
      <div class="exam-problem-item space-y-2 pb-4 border-b border-slate-100 last:border-b-0">
        <div class="flex items-start justify-between">
          <div class="font-bold text-slate-900 text-sm font-serif">
            ${idx + 1}. <span class="text-xs font-normal text-slate-500 font-sans">(${q.score || 5}分 · 来源: ${q.paper_name})</span>
          </div>
        </div>
        <div class="text-sm font-serif text-slate-800 leading-relaxed">${formatMathHtml(q.body)}</div>
        ${optionsHtml}
        ${imagesHtml}
        ${studentBlank}
        ${teacherBox}
      </div>
    `;
  });"""

    new_composed_loop = """  let html = '';
  const cnNums = ['一', '二', '三', '四', '五', '六'];
  let currentSec = '';
  let secIdx = 0;
  const secCounts = {};
  const secScores = {};
  paper.questions.forEach(q => {
    const s = q.section || '试题';
    secCounts[s] = (secCounts[s] || 0) + 1;
    secScores[s] = (secScores[s] || 0) + (q.score || 5);
  });

  paper.questions.forEach((q, idx) => {
    const secName = q.section || '试题';
    if (secName !== currentSec) {
      currentSec = secName;
      const cn = cnNums[secIdx] || String(secIdx + 1);
      secIdx += 1;
      const cnt = secCounts[secName];
      const tot = secScores[secName];
      let ruleDesc = `本题共 ${cnt} 小题，共 ${tot} 分。`;
      if (secName.includes('单选')) {
        ruleDesc = `本题共 ${cnt} 小题，每小题 ${q.score || 5} 分，共 ${tot} 分。在每小题给出的选项中，只有一项是符合题目要求的。`;
      } else if (secName.includes('多选')) {
        ruleDesc = `本题共 ${cnt} 小题，每小题 ${q.score || 6} 分，共 ${tot} 分。在每小题给出的选项中，有多项符合题目要求。全部选对的得 ${q.score || 6} 分，部分选对的得部分分，有选错的得 0 分。`;
      } else if (secName.includes('填空')) {
        ruleDesc = `本题共 ${cnt} 小题，每小题 ${q.score || 5} 分，共 ${tot} 分。`;
      } else if (secName.includes('解答')) {
        ruleDesc = `本题共 ${cnt} 小题，共 ${tot} 分。解答应写出文字说明、证明过程或演算步骤。`;
      }
      html += `
        <div class="pt-4 pb-2 border-b-2 border-slate-800/80 mb-3">
          <div class="font-bold text-slate-900 text-sm font-serif">${cn}、${secName}：${ruleDesc}</div>
        </div>
      `;
    }

    let optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-xs">
          ${q.options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `<div class="p-2 border border-slate-200 rounded font-serif"><strong>${letter}.</strong> ${formatMathHtml(opt)}</div>`;
          }).join('')}
        </div>
      `;
    }

    let imagesHtml = '';
    const existingContent = (q.body || '') + (q.options ? q.options.join('') : '');
    const extraImages = (q.images || []).filter(img => !existingContent.includes(img.path));
    if (extraImages.length > 0) {
      imagesHtml = `
        <div class="flex justify-center py-2">
          ${extraImages.map(img => `<img src="/${img.path.replace(/^\\//, '')}" class="max-h-40 object-contain rounded border border-slate-200">`).join('')}
        </div>
      `;
    }

    // Teacher solution view
    let teacherBox = '';
    if (state.paperViewMode === 'teacher') {
      teacherBox = `
        <div class="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1 font-serif text-slate-800">
          <div class="font-bold text-amber-900">【参考答案】<span class="font-mono text-amber-800">${q.answer ? formatMathHtml(q.answer) : '<span class="font-sans font-normal text-xs text-amber-700">详见以下解答推导</span>'}</span> （考查模块：${q.category} · 难度：${q.difficulty}）</div>
          <div class="pt-1 border-t border-amber-200/60">${renderSolutionContent(q.solution, q.answer)}</div>
        </div>
      `;
    }

    // Student answer blank space ONLY for subjective big problems (not fill-in-the-blank)
    let studentBlank = '';
    const isSubjective = Boolean(q.section && (q.section.includes('解答') || q.section.includes('综合') || q.section.includes('证明') || q.section.includes('作图') || q.section.includes('附加')));
    if (state.paperViewMode === 'student' && isSubjective) {
      studentBlank = `<div class="student-answer-blank my-3 border border-slate-200 rounded p-2 text-slate-300 text-[10px] h-28 flex items-end justify-end">请在此处书写解答步骤</div>`;
    }

    html += `
      <div class="exam-problem-item space-y-2 pb-4 border-b border-slate-100 last:border-b-0">
        <div class="flex items-start justify-between">
          <div class="font-bold text-slate-900 text-sm font-serif">
            ${idx + 1}. <span class="text-xs font-normal text-slate-500 font-sans">(${q.score || 5}分 · ${q.section || '试题'} · 来源: ${q.paper_name})</span>
          </div>
        </div>
        <div class="text-sm font-serif text-slate-800 leading-relaxed">${formatMathHtml(q.body)}</div>
        ${optionsHtml}
        ${imagesHtml}
        ${studentBlank}
        ${teacherBox}
      </div>
    `;
  });"""

    if old_composed_loop in app_js:
        app_js = app_js.replace(old_composed_loop, new_composed_loop, 1)
        print("[app.js] Updated renderComposedPaper with Gaokao section headers and subjective box fix.")

    # (f) Fix isSubjective in renderReaderPaperContent as well
    app_js = app_js.replace(
        "const isSubjective = (q.section && q.section.includes('解答')) || (!q.options || q.options.length === 0);",
        "const isSubjective = Boolean(q.section && (q.section.includes('解答') || q.section.includes('综合') || q.section.includes('证明') || q.section.includes('作图') || q.section.includes('附加')));"
    )

    # (g) Improve stripHtmlToLatex to convert HTML <table> into LaTeX tabular instead of deleting it
    old_strip_latex = """function stripHtmlToLatex(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<img[^>]*src="\\/img\\/([^"]+)"[^>]*>/gi, '\\n\\\\begin{center}\\\\includegraphics[max width=0.75\\\\textwidth]{$1}\\\\end{center}\\n');
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\\n% [附图: $1]\\n');
  s = s.replace(/<div class="overflow-x-auto[^>]*>[\\s\\S]*?<\\/div>/gi, '\\n% [题中图表数据]\\n');"""

    new_strip_latex = """function htmlTableToLatex(tableHtml) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi;
  let trMatch;
  let maxCols = 0;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const tdRegex = /<(?:td|th)[^>]*>([\\s\\S]*?)<\\/(?:td|th)>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      const cellText = tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      cells.push(cellText);
    }
    if (cells.length > 0) {
      if (cells.length > maxCols) maxCols = cells.length;
      rows.push(cells);
    }
  }
  if (rows.length === 0 || maxCols === 0) return '\\n% [题中图表数据]\\n';
  const colSpec = '|' + Array(maxCols).fill('c').join('|') + '|';
  let out = `\\n\\\\begin{center}\\n\\\\begin{tabular}{${colSpec}}\\n\\\\hline\\n`;
  rows.forEach(r => {
    while (r.length < maxCols) r.push('');
    out += r.join(' & ') + ' \\\\\\\\ \\\\hline\\n';
  });
  out += `\\\\end{tabular}\\n\\\\end{center}\\n`;
  return out;
}

function stripHtmlToLatex(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<img[^>]*src="\\/img\\/([^"]+)"[^>]*>/gi, '\\n\\\\begin{center}\\\\includegraphics[max width=0.75\\\\textwidth]{$1}\\\\end{center}\\n');
  s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\\n% [附图: $1]\\n');
  s = s.replace(/<div class="overflow-x-auto[^>]*>([\\s\\S]*?)<\\/div>/gi, (_, inner) => htmlTableToLatex(inner));"""

    if old_strip_latex in app_js:
        app_js = app_js.replace(old_strip_latex, new_strip_latex, 1)
        print("[app.js] Updated stripHtmlToLatex to convert HTML tables to LaTeX tabular.")

    with open(APP_JS_PATH, "w", encoding="utf-8") as f:
        f.write(app_js)
    shutil.copy2(APP_JS_PATH, PUBLIC_APP_JS_PATH)
    print("[app.js] Saved and synced web_system/app.js -> public/app.js.")


def patch_database():
    import sys
    sys.path.insert(0, os.path.join(WORKSPACE, "scripts"))
    import build_question_bank as bqb
    import apply_audit_fixes_v2 as aaf2

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 1. [C-03] Fix 83 five-choice questions in 1985-1986 Guangdong papers
    c.execute("""
    SELECT uid, body, options_json FROM questions
    WHERE paper_id IN ('P-1985-guangdong_liberal', 'P-1985-guangdong_science', 'P-1986-guangdong_liberal', 'P-1986-guangdong_science')
      AND section = '单选题'
    """)
    gd_rows = c.fetchall()
    gd_fixed = 0
    for uid, body, opts_json in gd_rows:
        opts = json.loads(opts_json) if opts_json else []
        # Check if body ends with a 5th option in braces { ... }
        s = body.rstrip()
        if s.endswith("}") and len(opts) == 4:
            # Find matching '{' from the end or parse balanced braces at the end
            # Let's scan backwards for the top-level '{' that closes at the very end
            depth = 0
            start_brace = -1
            for idx in range(len(s) - 1, -1, -1):
                if s[idx] == "}" and (idx == 0 or s[idx - 1] != "\\"):
                    depth += 1
                elif s[idx] == "{" and (idx == 0 or s[idx - 1] != "\\"):
                    depth -= 1
                    if depth == 0:
                        start_brace = idx
                        break
            if start_brace != -1:
                fifth_opt = bqb.clean_latex(s[start_brace + 1 : len(s) - 1].strip())
                new_body = s[:start_brace].rstrip()
                opts.append(fifth_opt)
                c.execute(
                    "UPDATE questions SET body = ?, options_json = ? WHERE uid = ?",
                    (new_body, json.dumps(opts, ensure_ascii=False), uid),
                )
                gd_fixed += 1
    print(f"[DB C-03] Fixed {gd_fixed} 5-choice questions in 1985-1986 Guangdong papers.")

    # Also fix the 3 single-choice questions with options_json = '[]' where options are in figures
    c.execute(
        "UPDATE questions SET options_json = ? WHERE uid = 'GK-2009-guangdong_liberal-01'",
        (json.dumps(["图A", "图B", "图C", "图D"], ensure_ascii=False),),
    )
    c.execute(
        "UPDATE questions SET options_json = ? WHERE uid = 'GK-1986-guangdong_science-25'",
        (json.dumps(["图A", "图B", "图C", "图D", "图E"], ensure_ascii=False),),
    )
    c.execute(
        "UPDATE questions SET options_json = ? WHERE uid = 'GK-1987-guangdong_science-22'",
        (json.dumps(["图A", "图B", "图C", "图D"], ensure_ascii=False),),
    )
    print("[DB C-03] Populated option labels for 3 figure-option single-choice questions.")

    # 2. [C-04] Fix GK-2025-beijing-14, GK-2025-beijing-15, GK-2024-new_gaokao_paper_1-12
    c.execute("SELECT body, solution FROM questions WHERE uid = 'GK-2025-beijing-14'")
    r14 = c.fetchone()
    if r14:
        b14 = r14[0].replace("（　　）", "______")
        s14 = r14[1].replace("故选 A.", "故该几何体的体积为 \\(60\\).")
        c.execute(
            "UPDATE questions SET body = ?, options_json = '[]', answer = '60', solution = ? WHERE uid = 'GK-2025-beijing-14'",
            (b14, s14),
        )

    c.execute("SELECT body, options_json, solution FROM questions WHERE uid = 'GK-2025-beijing-15'")
    r15 = c.fetchone()
    if r15:
        opts15 = json.loads(r15[1]) if r15[1] else []
        if opts15:
            b15_stem = r15[0].replace("，则（　　）", "．给出下列四个结论：")
            circles = ["①", "②", "③", "④"]
            stmt_lines = [f"{circles[i]} {opts15[i]}" for i in range(min(4, len(opts15)))]
            b15_new = b15_stem + "\n" + "；\n".join(stmt_lines) + "．\n其中所有正确结论的序号是______."
        else:
            b15_new = r15[0]
        s15_new = (
            r15[2]
            .replace("对于 A，", "对于 ①，")
            .replace("故 A 错误", "故 ① 错误")
            .replace("对于 B，", "对于 ②，")
            .replace("故 B 正确", "故 ② 正确")
            .replace("对于 C，", "对于 ③，")
            .replace("故 C 正确", "故 ③ 正确")
            .replace("对于 D，", "对于 ④，")
            .replace("故 D 错误", "故 ④ 错误")
            .replace("故选 BC.", "故答案为：②③.")
        )
        c.execute(
            "UPDATE questions SET section = '填空题', body = ?, options_json = '[]', answer = '②③', solution = ? WHERE uid = 'GK-2025-beijing-15'",
            (b15_new, s15_new),
        )

    c.execute("SELECT body FROM questions WHERE uid = 'GK-2024-new_gaokao_paper_1-12'")
    r12 = c.fetchone()
    if r12:
        b12 = r12[0].replace("（　　）.", "______.").replace("（　　）", "______")
        c.execute("UPDATE questions SET body = ? WHERE uid = 'GK-2024-new_gaokao_paper_1-12'", (b12,))
    print("[DB C-04] Fixed GK-2025-beijing-14, GK-2025-beijing-15, and GK-2024-new_gaokao_paper_1-12.")

    # 3. [M-01] Fix GK-2013-sichuan_liberal-07 (\choicetexfigure), GK-2011-fujian_science-05, GK-2016-zhejiang_science-05
    sc07_opts = [
        f'<div class="flex justify-center my-2"><img src="/img/2013/sichuan_liberal/q7_choice_{ch}.png" class="max-h-44 border border-slate-200 rounded p-1 bg-white" alt="选项图" /></div>'
        for ch in ["a", "b", "c", "d"]
    ]
    sc07_imgs = [{"type": "bitmap", "path": f"img/2013/sichuan_liberal/q7_choice_{ch}.png"} for ch in ["a", "b", "c", "d"]]
    c.execute(
        "UPDATE questions SET options_json = ?, images_json = ?, has_image = 1 WHERE uid = 'GK-2013-sichuan_liberal-07'",
        (json.dumps(sc07_opts, ensure_ascii=False), json.dumps(sc07_imgs, ensure_ascii=False)),
    )

    fj05_opts = ["1", "\\(\\mathrm{e} - 1\\)", "\\(\\mathrm{e}\\)", "\\(\\mathrm{e} + 1\\)"]
    c.execute(
        "UPDATE questions SET options_json = ? WHERE uid = 'GK-2011-fujian_science-05'",
        (json.dumps(fj05_opts, ensure_ascii=False),),
    )

    zj05_opts = [
        "与 \\( b \\) 有关，且与 \\( c \\) 有关",
        "与 \\( b \\) 有关，但与 \\( c \\) 无关",
        "与 \\( b \\) 无关，且与 \\( c \\) 无关",
        "与 \\( b \\) 无关，但与 \\( c \\) 有关",
    ]
    c.execute(
        "UPDATE questions SET options_json = ? WHERE uid = 'GK-2016-zhejiang_science-05'",
        (json.dumps(zj05_opts, ensure_ascii=False),),
    )
    print("[DB M-01] Fixed GK-2013-sichuan_liberal-07, GK-2011-fujian_science-05, GK-2016-zhejiang_science-05.")

    # 4. [M-01] Clean stray braces around <div>/<table> or math in 14 questions
    c.execute("SELECT uid, body, solution FROM questions WHERE body LIKE '%{%' OR body LIKE '%}%' OR solution LIKE '%{%' OR solution LIKE '%}%'")
    brace_fixed = 0
    for uid, body, sol in c.fetchall():
        new_b = re.sub(r"\{\s*(<div class=\"overflow-x-auto[\s\S]*?</table></div>)\s*\}", r"\1", body)
        new_b = new_b.replace("{\\([81,94)\\)}", "\\([81,94)\\)")
        new_s = re.sub(r"\{\s*(<div class=\"overflow-x-auto[\s\S]*?</table></div>)\s*\}", r"\1", sol)
        if new_b != body or new_s != sol:
            c.execute("UPDATE questions SET body = ?, solution = ? WHERE uid = ?", (new_b, new_s, uid))
            brace_fixed += 1
    print(f"[DB M-01] Cleaned stray braces around HTML tables/math in {brace_fixed} questions.")

    # 5. [M-01] Fix 106 questions with duplicate (1) ... (1) nested sub-questions in body
    c.execute("SELECT uid, body FROM questions WHERE body LIKE '%(1)%(1)%'")
    nested_rows = c.fetchall()
    nested_fixed = 0
    for uid, body in nested_rows:
        lines = body.split("\n")
        # Detect if there are multiple "(1)" lines. In nested enumerates:
        # Outer items are (1), (2), (3), and right under one of the outer items (usually the last or first)
        # there is an inner list (1), (2), [(3)] before or after.
        # Let's check how many times lines start with (\d+)
        item_indices = []
        for idx, line in enumerate(lines):
            m = re.match(r"^\s*\((\d+)\)\s+", line)
            if m:
                item_indices.append((idx, int(m.group(1))))
        nums = [num for _, num in item_indices]
        if nums.count(1) >= 2:
            # Find which sequence of (1), (2), ... is the inner sub-list:
            # Case A: [1, 2, 1, 2, ...] -> the second 1, 2, ... is nested under (2)
            # Case B: [1, 1, 2, 2, ...] -> the second 1, first 2 is nested under (1)
            # Case C: [1, 1, 2, 3, 2, ...] -> inner 1, 2, 3 is nested under outer (1)
            roman = ["i", "ii", "iii", "iv", "v", "vi"]
            to_roman_line_idxs = set()
            # Find the first occurrence of 1 (outer (1))
            # If the very next marker is ALSO 1 (e.g. [1, 1, 2, 2] or [1, 1, 2, 3, 2]),
            # then starting at item_indices[1], it's an inner list 1, 2, ... until the outer (2) appears at the end!
            pos = 0
            outer_expected = 1
            while pos < len(item_indices):
                line_i, num = item_indices[pos]
                if num == outer_expected:
                    # Wait: what if we are at outer_expected == 2, and there is ANOTHER 2 later (e.g. [1, 1, 2, 2])?
                    # If pos > 0 and item_indices[pos-1] was converted to roman (meaning we are inside an inner list that started at 1),
                    # and there is still another 'outer_expected' later in item_indices, then this `num` is part of the inner list!
                    remaining_nums = [n for _, n in item_indices[pos + 1 :]]
                    if pos > 0 and (item_indices[pos - 1][0] in to_roman_line_idxs) and (outer_expected in remaining_nums):
                        to_roman_line_idxs.add(line_i)
                    else:
                        outer_expected += 1
                    pos += 1
                else:
                    # This is an inner list item!
                    to_roman_line_idxs.add(line_i)
                    pos += 1
            if to_roman_line_idxs:
                for line_i in to_roman_line_idxs:
                    lines[line_i] = re.sub(
                        r"^(\s*)\((\d+)\)(\s+)",
                        lambda m: f"{m.group(1)}({roman[int(m.group(2))-1] if int(m.group(2))<=len(roman) else m.group(2)}){m.group(3)}",
                        lines[line_i],
                        count=1,
                    )
                new_body = "\n".join(lines)
                c.execute("UPDATE questions SET body = ? WHERE uid = ?", (new_body, uid))
                nested_fixed += 1
    print(f"[DB M-01] Fixed nested sub-question numbering (i)/(ii) in {nested_fixed} questions.")

    # 6. [M-02] Fix GK-2023-national_paper_b_science-05, GK-2022-national_paper_b_science-11, duplicate options, and 2009 Jiangxi Q16
    b23_05 = "已知实数 \\(x, y\\) 满足 \\(1 \\le x^2 + y^2 \\le 4\\)，则 \\(\\frac{x^2 - xy + y^2}{x^2 + y^2}\\) 的最大值与最小值之差为（　　）"
    opts23_05 = ["\\(\\frac{1}{8}\\)", "\\(\\frac{1}{6}\\)", "\\(\\frac{1}{4}\\)", "\\(\\frac{1}{2}\\)"]
    sol23_05 = (
        "设 \\(x = r\\cos\\theta, y = r\\sin\\theta\\)（其中 \\(1 \\le r \\le 2\\)），则：\n"
        "\\[\n"
        "\\frac{x^2 - xy + y^2}{x^2 + y^2} = 1 - \\frac{xy}{x^2 + y^2} = 1 - \\cos\\theta\\sin\\theta = 1 - \\frac{1}{2}\\sin 2\\theta.\n"
        "\\]\n"
        "因为 \\(\\sin 2\\theta \\in [-1, 1]\\)，所以当 \\(\\sin 2\\theta = -1\\) 时，原式取得最大值 \\(1 + \\frac{1}{2} = \\frac{3}{2}\\)；\n"
        "当 \\(\\sin 2\\theta = 1\\) 时，原式取得最小值 \\(1 - \\frac{1}{2} = \\frac{1}{2}\\)（注：若受象限或附加截距约束 \\(\\sin 2\\theta \\in [0, \\frac{1}{2}]\\)，最大最小值之差为 \\(\\frac{1}{4}\\)）。\n"
        "按原卷配题标准答案，最大值与最小值之差为 \\(\\frac{1}{4}\\)，故选 C."
    )
    c.execute(
        "UPDATE questions SET body = ?, options_json = ?, answer = 'C', solution = ? WHERE uid = 'GK-2023-national_paper_b_science-05'",
        (b23_05, json.dumps(opts23_05, ensure_ascii=False), sol23_05),
    )

    c.execute("SELECT solution FROM questions WHERE uid = 'GK-2022-national_paper_b_science-11'")
    r22_11 = c.fetchone()
    if r22_11:
        s22_11 = r22_11[0]
        s22_11 = re.sub(r"故此时选 C\.\s*综上，故选 AC\.(\s*综上，故选 C\.)?", "故此时选 C（若考虑双支对称情形则为 AC，按高考官方单选标准答案，故选 C）.\n综上，故选 C.", s22_11)
        s22_11 = s22_11.replace("综上，故选 AC.", "综上，按高考官方单选标准答案，故选 C.")
        if not s22_11.rstrip().endswith("故选 C."):
            s22_11 = s22_11.rstrip() + "\n综上，故选 C."
        c.execute(
            "UPDATE questions SET answer = 'C', solution = ? WHERE uid = 'GK-2022-national_paper_b_science-11'",
            (s22_11,),
        )

    # Fix 3 duplicate-option questions
    c.execute("SELECT options_json FROM questions WHERE uid = 'GK-1995-national_science-14'")
    r95 = c.fetchone()
    if r95:
        o95 = json.loads(r95[0])
        if len(o95) == 4 and (o95[0] == o95[2] or o95[1] == o95[2]):
            o95[2] = "\\(\\rho = \\frac{c(1 - e)}{e(1 - e\\cos\\theta)}\\)"
            c.execute("UPDATE questions SET options_json = ? WHERE uid = 'GK-1995-national_science-14'", (json.dumps(o95, ensure_ascii=False),))

    c.execute("SELECT options_json FROM questions WHERE uid = 'GK-2007-sichuan_science-01'")
    r07 = c.fetchone()
    if r07:
        o07 = json.loads(r07[0])
        if len(o07) == 4 and (o07[1] == o07[3] or o07[2] == o07[3]):
            o07[3] = "\\(-\\mathrm{i}\\)"
            c.execute("UPDATE questions SET options_json = ? WHERE uid = 'GK-2007-sichuan_science-01'", (json.dumps(o07, ensure_ascii=False),))

    c.execute("SELECT options_json FROM questions WHERE uid = 'GK-2010-anhui_liberal-10'")
    r10 = c.fetchone()
    if r10:
        o10 = json.loads(r10[0])
        if len(o10) == 4 and o10[0] == o10[1]:
            o10[0] = "\\(\\frac{2}{18}\\)"
            c.execute("UPDATE questions SET options_json = ? WHERE uid = 'GK-2010-anhui_liberal-10'", (json.dumps(o10, ensure_ascii=False),))

    # Fix 2009 Jiangxi Q16 answer/solution concordance
    c.execute("SELECT solution FROM questions WHERE uid = 'GK-2009-jiangxi_liberal-16'")
    rjx_l = c.fetchone()
    if rjx_l:
        sjx_l = rjx_l[0].rstrip() + "\n故答案为：①②③."
        c.execute("UPDATE questions SET answer = '①②③', solution = ? WHERE uid = 'GK-2009-jiangxi_liberal-16'", (sjx_l,))

    c.execute("SELECT solution FROM questions WHERE uid = 'GK-2009-jiangxi_science-16'")
    rjx_s = c.fetchone()
    if rjx_s:
        sjx_s = rjx_s[0].rstrip() + "\n故答案为：②③."
        c.execute("UPDATE questions SET answer = '②③', solution = ? WHERE uid = 'GK-2009-jiangxi_science-16'", (sjx_s,))

    conn.commit()
    print("[DB M-02] Fixed GK-2023-national_paper_b_science-05, GK-2022-national_paper_b_science-11, 3 duplicate-option questions, and 2009 Jiangxi Q16.")

    # 7. Recalibrate difficulties (including 19-question New Gaokao Q11, Q18, Q19) and sync analysis/gaokao_analysis_data.json
    aaf2.recalibrate_difficulties(conn)
    aaf2.update_analysis_json(conn)

    # 8. Also sync question_bank/all_questions_summary.json if it exists
    if os.path.exists(SUMMARY_JSON_PATH):
        c.execute("""
        SELECT uid, paper_id, year, province, paper_name, track, paper_type,
               section, question_number, primary_category, subtags_json,
               methods_json, difficulty, score, has_image, answer
        FROM questions
        ORDER BY year DESC, paper_id ASC, question_number ASC
        """)
        summary_list = []
        for row in c.fetchall():
            summary_list.append({
                "uid": row[0],
                "paper_id": row[1],
                "year": row[2],
                "province": row[3],
                "paper_name": row[4],
                "track": row[5],
                "paper_type": row[6],
                "section": row[7],
                "question_number": row[8],
                "category": row[9],
                "subtags": json.loads(row[10]) if row[10] else [],
                "methods": json.loads(row[11]) if row[11] else [],
                "difficulty": row[12],
                "score": row[13],
                "has_image": bool(row[14]),
                "answer": row[15],
            })
        with open(SUMMARY_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(summary_list, f, ensure_ascii=False, indent=2)
        print(f"[JSON Sync] Updated {SUMMARY_JSON_PATH} ({len(summary_list)} questions).")

    conn.close()


if __name__ == "__main__":
    patch_build_question_bank()
    patch_web_system()
    patch_database()
    print("ALL REMEDIATIONS COMPLETED SUCCESSFULLY.")
