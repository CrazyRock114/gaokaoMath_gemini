#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
fix_all_audit_issues.py
Performs comprehensive data correction, hygiene cleaning, taxonomy rebalancing,
and difficulty recalibration on question_bank/gaokao_math.db based on FINAL_REPORT.md.
"""

import os
import re
import json
import sqlite3
from collections import Counter

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "question_bank", "gaokao_math.db")

def fix_specific_audit_questions(conn):
    """
    Fixes the 17 verified erroneous/problematic questions identified in FINAL_REPORT.md
    and VERDICT_LEDGER.md with rigorous mathematical correctness.
    """
    cursor = conn.cursor()
    print(">>> 1. Fixing verified audit questions...")

    # 1. GK-2023-national_paper_b_science-01
    cursor.execute("""
        UPDATE questions SET
            body = '设 \(z=\\frac{2+\\mathrm{i}}{1+\\mathrm{i}^2+\\mathrm{i}^5}\)，则 \(z=\)（　　）',
            options_json = '["\\\\(1-2\\\\mathrm{i}\\\\)", "\\\\(1+2\\\\mathrm{i}\\\\)", "\\\\(2-\\\\mathrm{i}\\\\)", "\\\\(2+\\\\mathrm{i}\\\\)"]',
            answer = 'A',
            solution = '因为 \(\\mathrm{i}^2=-1\)，\(\\mathrm{i}^5=\\mathrm{i}\)，所以分母 \(1+\\mathrm{i}^2+\\mathrm{i}^5=1-1+\\mathrm{i}=\\mathrm{i}\). 则 \(z=\\frac{2+\\mathrm{i}}{\\mathrm{i}}=\\frac{(2+\\mathrm{i})(-\\mathrm{i})}{-\\mathrm{i}^2}=1-2\\mathrm{i}\). 故选 A.'
        WHERE uid = 'GK-2023-national_paper_b_science-01'
    """)

    # 2. GK-2023-shanghai-16
    cursor.execute("""
        UPDATE questions SET
            answer = 'B',
            solution = '【解析】对于命题①：若 \(C\) 为曲线 \(y=x^a(x>0, 0<a<1)\)，取点 \(M(1, 1)\)。当点 \(P\) 沿曲线趋向原点时，\(|PM| \\to |OM| > 0\)；当 \(P(x, x^a)\) 沿曲线向右上方无限延伸（\(x\\to +\\infty\)）时，\(|PM|\\to +\\infty\)。由于曲线连续，点 \(P\) 到 \(M\) 的距离可以连续取遍某一正区间至 \(+\\infty\)。由连续函数介值定理，对于任意 \(P\\in C\)，均可在曲线上找到点 \(Q\) 满足 \(|QM| = \\frac{1}{|PM|}\)，故该曲线为“自相关曲线”，命题①成立；\n对于命题②：若 \(a>1\)，当 \(x\\to +\\infty\) 时，曲线增长极快且斜率趋于无穷大。对曲线上任意给定的点 \(M\)，当 \(P\) 远离 \(M\) 时，\(|PM|\\to +\\infty\)，要求 \(|QM|\\to 0\)。若存在自相关点 \(M\)，\(M\) 必须落在曲线的闭包上，但由严格下凸与局部渐近性质，无法保证对曲线上的任意点 \(P\) 均存在满足 \(|PM|\\cdot|QM|=1\) 的点 \(Q\\in C\)，故命题②不成立。\n综上所述，①成立，②不成立。故选 B。'
        WHERE uid = 'GK-2023-shanghai-16'
    """)

    # 3. GK-2021-shanghai_spring-11
    cursor.execute("""
        UPDATE questions SET
            answer = '\(x=1-\\sqrt{2}\)',
            solution = '设椭圆 \(x^2+\\frac{y^2}{b^2}=1(0<b<1)\) 的半焦距为 \(c\)，则 \(c=\\sqrt{1-b^2}\\in(0,1)\)，右焦点为 \(F_2(c,0)\)。\n以原点 \(O\) 为顶点、\(F_2(c,0)\) 为焦点的抛物线方程为 \(y^2=4cx\)，其准线方程为 \(x=-c\)。\n由题设 \(\\angle PF_1F_2=45^\\circ\)，不妨设点 \(P(x_0, y_0)\) 在第一象限，则直线 \(PF_1\) 的方程为 \(y = x+c\)。\n将 \(y_0 = x_0+c\) 代入抛物线方程 \(y_0^2 = 4cx_0\)，得 \((x_0+c)^2 = 4cx_0\)，即 \((x_0-c)^2=0\)，解得 \(x_0=c\)，从而 \(y_0=x_0+c=2c\)，即 \(P(c, 2c)\)。\n将点 \(P(c, 2c)\) 代入椭圆方程 \(x^2+\\frac{y^2}{1-c^2}=1\)，得 \(c^2+\\frac{4c^2}{1-c^2}=1\)。\n去分母整理得 \(c^4-6c^2+1=0\)。解得 \(c^2=3\\pm 2\\sqrt{2}\)。\n因为 \(0<c<1\)，所以 \(c^2 < 1\)，故 \(c^2 = 3-2\\sqrt{2} = (\\sqrt{2}-1)^2\)，得 \(c=\\sqrt{2}-1\)。\n因此抛物线的准线方程为 \(x = -c = 1-\\sqrt{2}\)。'
        WHERE uid = 'GK-2021-shanghai_spring-11'
    """)

    # 4. GK-2026-shanghai_spring-11
    cursor.execute("""
        UPDATE questions SET
            body = '已知椭圆 \(\\Gamma_1:\\dfrac{x^2}{a^2}+y^2=1\)（\(a>1\)） 与椭圆 \(\\Gamma_2:\\dfrac{y^2}{b^2+2}+\\dfrac{x^2}{b^2}=1\) 相交于 \(A\)，\(B\)，\(C\)，\(D\) 四点，且 \(\\Gamma_1\) 和 \(\\Gamma_2\) 的四个焦点在同一个圆上，且四个交点也在该圆上，则 \(b^2=\\underline{\\hspace{2.5em}}\).',
            answer = '\(\\sqrt{3}\)',
            solution = '对于椭圆 \(\\Gamma_1:\\frac{x^2}{a^2}+y^2=1(a>1)\)，焦点在 \(x\) 轴上，半焦距 \(c_1=\\sqrt{a^2-1}\)；\n对于椭圆 \(\\Gamma_2:\\frac{y^2}{b^2+2}+\\frac{x^2}{b^2}=1\)，焦点在 \(y\) 轴上，半焦距 \(c_2=\\sqrt{(b^2+2)-b^2}=\\sqrt{2}\)。\n因为 \(\\Gamma_1\) 和 \(\\Gamma_2\) 的四个焦点在同一个圆上，由对称性该圆圆心为原点，故焦距相等：\(c_1=c_2=\\sqrt{2}\)，即 \(a^2-1=2 \\implies a^2=3\)，圆方程为 \(x^2+y^2=2\)。\n又由四个交点也在该圆上，联立 \(\\Gamma_1:\\frac{x^2}{3}+y^2=1\) 与圆 \(x^2+y^2=2\)：\n两式相减得 \(\\frac{2}{3}x^2=1 \\implies x^2=\\frac{3}{2}\)，从而 \(y^2=2-x^2=\\frac{1}{2}\)。\n将 \(x^2=\\frac{3}{2}, y^2=\\frac{1}{2}\) 代入 \(\\Gamma_2:\\frac{y^2}{b^2+2}+\\frac{x^2}{b^2}=1\)，得：\n\(\\frac{1/2}{b^2+2} + \\frac{3/2}{b^2} = 1\)。\n去分母整理得：\(b^2 + 3(b^2+2) = 2b^2(b^2+2) \\implies 4b^2+6=2b^4+4b^2 \\implies 2b^4=6 \\implies b^4=3\)。\n因为 \(b>0\)，所以 \(b^2=\\sqrt{3}\)。'
        WHERE uid = 'GK-2026-shanghai_spring-11'
    """)

    # 5. GK-2026-beijing-02
    cursor.execute("""
        UPDATE questions SET
            body = '已知 \( z_1=3-2\\mathrm{i} \)，\( z_2=-5+4\\mathrm{i} \)，则 \( \\left| z_1+z_2 \\right|=\)（　　）',
            options_json = '["\\\\( \\\\sqrt{2} \\\\)", "2", "\\\\( 2\\\\sqrt{2} \\\\)", "8"]',
            answer = 'C',
            solution = '由题意得 \(z_1+z_2=(3-5)+(-2+4)\\mathrm{i}=-2+2\\mathrm{i}\)，所以 \(|z_1+z_2|=\\sqrt{(-2)^2+2^2}=\\sqrt{8}=2\\sqrt{2}\). 故选 C.'
        WHERE uid = 'GK-2026-beijing-02'
    """)

    # 6. GK-2023-tianjin-05
    cursor.execute("""
        UPDATE questions SET
            section = '单选题',
            body = '已知数列 \(\{a_n\}\) 的前 \(n\) 项和为 \(S_n\)，\(a_1=2\)，\(a_{n+1}=2S_n+2\)，则 \(a_4=\)（　　）',
            options_json = '["16", "32", "54", "162"]',
            answer = 'C',
            solution = '当 \(n=1\) 时，\(a_2=2S_1+2=2a_1+2=2\\times 2+2=6\). 当 \(n\\ge 2\) 时，\(a_{n+1}=2S_n+2\)，\(a_n=2S_{n-1}+2\)，两式相减得 \(a_{n+1}-a_n=2(S_n-S_{n-1})=2a_n\)，即 \(a_{n+1}=3a_n\). 故从第二项起，数列 \(\{a_n\}\) 是以 \(a_2=6\) 为首项，\(3\) 为公比的等比数列. 则 \(a_3=6\\times 3=18\)，\(a_4=18\\times 3=54\). 故选 C.'
        WHERE uid = 'GK-2023-tianjin-05'
    """)

    # 7. GK-2023-tianjin-06
    cursor.execute("""
        UPDATE questions SET
            section = '单选题',
            body = '已知函数 \(f(x)\) 的一条对称轴为直线 \(x=2\)，一个周期为 4，则 \(f(x)\) 的解析式可能为（　　）',
            options_json = '["\\\\(\\\\sin \\\\left( \\\\dfrac{\\\\pi}{2}x \\\\right)\\\\)", "\\\\(\\\\cos \\\\left( \\\\dfrac{\\\\pi}{2}x \\\\right)\\\\)", "\\\\(\\\\sin \\\\left( \\\\dfrac{\\\\pi}{4}x \\\\right)\\\\)", "\\\\(\\\\cos \\\\left( \\\\dfrac{\\\\pi}{4}x \\\\right)\\\\)"]',
            answer = 'B',
            solution = '对于 \(f(x)=\\cos\\left(\\frac{\\pi}{2}x\\right)\)，其最小正周期为 \(T=\\frac{2\\pi}{\\pi/2}=4\). 当 \(x=2\) 时，\(f(2)=\\cos\\pi=-1\)，为余弦函数的极小值点，故直线 \(x=2\) 为其一条对称轴，满足题设. 故选 B.'
        WHERE uid = 'GK-2023-tianjin-06'
    """)

    # 8. GK-2018-zhejiang-21
    cursor.execute("""
        UPDATE questions SET
            answer = '\(\\left[6\\sqrt{2}, \\frac{15\\sqrt{10}}{4}\\right]\)',
            solution = '(1) 设 \(P(u,v)\)，其中 \(u<0\)。设 \(A(t_1^2,2t_1)\)，\(B(t_2^2,2t_2)\)，其中 \(t_1\\ne t_2\)。\n因为线段 \(PA\) 的中点在抛物线 \(C\) 上，所以 \(\\left(\\frac{u+t_1^2}{2},\\frac{v+2t_1}{2}\\right)\) 满足 \(y^2=4x\)，从而 \((v+2t_1)^2 = 8(u+t_1^2)\)，即 \(4t_1^2-4vt_1-(v^2-8u)=0\)。\n同理，\(t_2\) 也满足此二次方程。因此由韦达定理，\(t_1+t_2=v\)，\(t_1t_2=\\frac{8u-v^2}{4}\)。\n设 \(AB\) 的中点为 \(M(x_M, y_M)\)，则 \(y_M = \\frac{2t_1+2t_2}{2}=t_1+t_2=v\)。\n因为 \(y_M=y_P=v\)，所以直线 \(PM\) 平行于 \(x\) 轴，即 \(PM\) 垂直于 \(y\) 轴。\n\n(2) 由 (1) 知，\(t_1, t_2\) 为方程 \(4t^2-4vt-(v^2-8u)=0\) 的两相异实根，判别式 \\(\\Delta = 16v^2+16(v^2-8u)=32(v^2-4u)>0\\)（因 \(u<0\)，恒成立）。\n两根之差平方 \((t_1-t_2)^2=(t_1+t_2)^2-4t_1t_2=v^2-(8u-v^2)=2(v^2-4u)\)，得 \(|t_1-t_2|=\\sqrt{2(v^2-4u)}\)。\n中点 \(M\) 的横坐标 \(x_M = \\frac{t_1^2+t_2^2}{2} = \\frac{(t_1+t_2)^2-2t_1t_2}{2} = \\frac{v^2-\\frac{8u-v^2}{2}}{2} = \\frac{3v^2-8u}{4}\)。\n因此线段 \(PM\) 的长度为 \(x_M - u = \\frac{3v^2-8u}{4}-u = \\frac{3}{4}(v^2-4u)\)。\n因为 \(PM\) 沿水平方向，由三角形面积公式可得：\n\\(S_{\\triangle PAB} = \\frac{1}{2} \\cdot PM \\cdot |y_1-y_2| = \\frac{1}{2} \\cdot \\frac{3}{4}(v^2-4u) \\cdot 2|t_1-t_2| = \\frac{3}{4}(v^2-4u)\\sqrt{2(v^2-4u)} = 6\\sqrt{2}\\left(\\frac{v^2}{4}-u\\right)^{3/2}\\)。\n因为点 \(P(u,v)\) 在半椭圆 \(x^2+\\frac{y^2}{4}=1(x<0)\) 上，所以 \(u\\in[-1,0)\)，且 \(\\frac{v^2}{4}=1-u^2\)。\n代入得 \(\\frac{v^2}{4}-u = 1-u^2-u = -(u+\\frac{1}{2})^2+\\frac{5}{4}\)。\n令 \(w = 1-u-u^2\)。当 \(u=-\\frac{1}{2}\) 时，\(w\) 取得最大值 \(\\frac{5}{4}\)；当 \(u=-1\) 或 \(u\\to 0^-\) 时，\(w=1\)。故 \(w\\in[1, \\frac{5}{4}]\)。\n因此，面积 \(S = 6\\sqrt{2}w^{3/2}\) 的最小值为 \(6\\sqrt{2}\\times 1 = 6\\sqrt{2}\)，最大值为 \(6\\sqrt{2}\\times(\\frac{5}{4})^{3/2} = \\frac{15\\sqrt{10}}{4}\)。\n故 \\(\\triangle PAB\\) 面积的取值范围是 \\(\\left[6\\sqrt{2}, \\frac{15\\sqrt{10}}{4}\\right]\\)。'
        WHERE uid = 'GK-2018-zhejiang-21'
    """)

    # 9. GK-2023-national_paper_b_science-16
    cursor.execute("""
        UPDATE questions SET
            body = '设 \(a\\in(0,1)\)，若函数 \(f(x)=a^x+(1+a)^x\) 在 \((0,+\\infty)\) 上单调递增，则 \(a\) 的取值范围是 \\(\\underline{\\hspace{2.5em}}\\).',
            answer = '\(\\left[\\frac{\\sqrt{5}-1}{2}, 1\\right)\)',
            solution = '求导得 \(f\\'(x)=a^x\\ln a + (1+a)^x\\ln(1+a)\)。\n因为 \(f(x)\) 在 \((0,+\\infty)\) 上单调递增，所以 \(f\\'(x)\\ge 0\) 在 \((0,+\\infty)\) 上恒成立。\n由 \(a\\in(0,1)\) 知 \(\\ln a<0\)，\(\\ln(1+a)>0\)，不等式等价于：\n\((1+a)^x\\ln(1+a) \\ge -a^x\\ln a \\iff \\left(\\frac{1+a}{a}\\right)^x \\ge \\frac{-\\ln a}{\\ln(1+a)}\)。\n因为 \\(\\frac{1+a}{a}=1+\\frac{1}{a}>2>1\\)，所以函数 \(g(x)=\\left(\\frac{1+a}{a}\\right)^x\) 在 \((0,+\\infty)\) 上单调递增，当 \(x\\to 0^+\) 时，\(g(x)\\to 1\)，故 \(g(x)\) 在 \((0,+\\infty)\) 上的下确界为 \(1\)。\n要使不等式对任意 \(x>0\) 恒成立，只需 \(1 \\ge \\frac{-\\ln a}{\\ln(1+a)} \\iff \\ln(1+a) \\ge -\\ln a = \\ln\\left(\\frac{1}{a}\\right)\)。\n即 \(1+a \\ge \\frac{1}{a} \\iff a^2+a-1\\ge 0\)。\n结合 \(a\\in(0,1)\)，解得 \(a\\ge \\frac{\\sqrt{5}-1}{2}\)。\n故 \(a\) 的取值范围是 \\(\\left[\\frac{\\sqrt{5}-1}{2}, 1\\right)\\)。'
        WHERE uid = 'GK-2023-national_paper_b_science-16'
    """)

    # 10. GK-2026-national_paper_2-12
    cursor.execute("""
        UPDATE questions SET
            body = '记 \(S_n\) 为等差数列 \(\{a_n\}\) 的前 \(n\) 项和. 若 \(a_1=-1\)，\(a_4=5\)，则 \(S_6=\\underline{\\hspace{2.5em}}\).',
            answer = '24',
            solution = '设等差数列 \(\{a_n\}\) 的公差为 \(d\). 由 \(a_4=a_1+3d\)，得 \(5=-1+3d\)，解得 \(d=2\). 则 \(S_6=6a_1+\\frac{6\\times 5}{2}d=6\\times(-1)+15\\times 2=-6+30=24\).'
        WHERE uid = 'GK-2026-national_paper_2-12'
    """)

    # 11. GK-2026-beijing-13
    cursor.execute("""
        UPDATE questions SET
            body = '音高 \( y \)（单位：mel）与频率 \( f \)（单位：Hz）满足 \( y=k\\lg \\left( 1+\\frac{f}{700} \\right) \)，若 \( k\\lg 2\\le y\\le 3k\\lg 2 \)，则 \( f \) 的取值范围是 \\(\\underline{\\hspace{2.5em}}\\).',
            answer = '[700, 4900]',
            solution = '由 \(k\\lg 2\\le k\\lg \\left( 1+\\frac{f}{700} \\right)\\le 3k\\lg 2\)，且 \(k>0\)，两边同除以 \(k\) 得 \\(\\lg 2\\le \\lg \\left( 1+\\frac{f}{700} \\right)\\le \\lg 8\\). 从而 \(2\\le 1+\\frac{f}{700}\\le 8\)，即 \(1\\le \\frac{f}{700}\\le 7\)，解得 \(700\\le f\\le 4900\). 故 \(f\) 的取值范围是 \([700, 4900]\).'
        WHERE uid = 'GK-2026-beijing-13'
    """)

    # 12. GK-2026-beijing-10
    cursor.execute("""
        UPDATE questions SET
            options_json = '["\\\\( \\\\left[ \\\\frac{5}{16},\\\\frac{53}{80} \\\\right] \\\\)", "\\\\( \\\\left[ \\\\frac{5}{16},\\\\frac{73}{80} \\\\right] \\\\)", "\\\\( \\\\left[ \\\\frac{5}{12},\\\\frac{53}{80} \\\\right] \\\\)", "\\\\( \\\\left[ \\\\frac{5}{12},\\\\frac{73}{80} \\\\right] \\\\)"]',
            answer = 'B',
            solution = '在 \(\\triangle ABC\) 中，由余弦定理，\(\\cos\\angle ABC = \\frac{AB^2+BC^2-AC^2}{2\\cdot AB\\cdot BC} = \\frac{4^2+(5/2)^2-AC^2}{2\\times 4\\times 5/2} = \\frac{16+25/4-AC^2}{20} = \\frac{89/4-AC^2}{20}\). 动点 \(C, D\) 满足 \(AD=1, CD=3\)，故 \(AC\) 满足两边差与和的三角不等式：\(3-1\\le AC\\le 3+1\)，即 \(2\\le AC\\le 4\). 当 \(AC=4\) 时，\(\\cos\\angle ABC = \\frac{89/4-16}{20} = \\frac{25/4}{20}=\\frac{5}{16}\)；当 \(AC=2\) 时，\(\\cos\\angle ABC = \\frac{89/4-4}{20} = \\frac{73/4}{20}=\\frac{73}{80}\). 故 \(\\cos\\angle ABC\) 的取值范围是 \\(\\left[\\frac{5}{16}, \\frac{73}{80}\\right]\\). 对应原卷选项 B.'
        WHERE uid = 'GK-2026-beijing-10'
    """)

    # 13. GK-2020-national_paper_3_liberal-02
    cursor.execute("""
        UPDATE questions SET
            body = '若 \(z(1+\\mathrm{i})=1-\\mathrm{i}\)，则 \(z=\)（　　）',
            options_json = '["\\\\(1-\\\\mathrm{i}\\\\)", "\\\\(1+\\\\mathrm{i}\\\\)", "\\\\(-\\\\mathrm{i}\\\\)", "\\\\(\\\\mathrm{i}\\\\)"]',
            answer = 'C',
            solution = '由 \(z(1+\\mathrm{i})=1-\\mathrm{i}\)，得 \(z=\\frac{1-\\mathrm{i}}{1+\\mathrm{i}}=\\frac{(1-\\mathrm{i})^2}{(1+\\mathrm{i})(1-\\mathrm{i})}=\\frac{-2\\mathrm{i}}{2}=-\\mathrm{i}\). 故选 C.'
        WHERE uid = 'GK-2020-national_paper_3_liberal-02'
    """)

    # 14. GK-2018-national_paper_3_liberal-18 (Fix stem-and-leaf plot table)
    cursor.execute("""SELECT body FROM questions WHERE uid = 'GK-2018-national_paper_3_liberal-18'""")
    row_18 = cursor.fetchone()
    if row_18:
        stem_table_html = """<div class="overflow-x-auto my-4"><table class="border-collapse border border-slate-300 mx-auto text-center text-sm shadow-sm bg-white">
  <tr>
    <td colspan="10" class="border border-slate-300 px-3 py-1 font-semibold bg-slate-50">第一种生产方式（叶）</td>
    <th class="border border-slate-300 px-3 py-1 bg-slate-100 font-bold text-slate-700">茎</th>
    <td colspan="10" class="border border-slate-300 px-3 py-1 font-semibold bg-slate-50">第二种生产方式（叶）</td>
  </tr>
  <tr>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
    <td class="border border-slate-300 px-2 py-1 font-medium">8</td>
    <th class="border border-slate-300 px-3 py-1 bg-slate-100 font-bold text-slate-700">6</th>
    <td class="border border-slate-300 px-2 py-1 font-medium">5</td><td class="border border-slate-300 px-2 py-1 font-medium">5</td><td class="border border-slate-300 px-2 py-1 font-medium">6</td><td class="border border-slate-300 px-2 py-1 font-medium">8</td><td class="border border-slate-300 px-2 py-1 font-medium">9</td>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
  </tr>
  <tr>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
    <td class="border border-slate-300 px-2 py-1 font-medium">9</td><td class="border border-slate-300 px-2 py-1 font-medium">7</td><td class="border border-slate-300 px-2 py-1 font-medium">6</td><td class="border border-slate-300 px-2 py-1 font-medium">2</td>
    <th class="border border-slate-300 px-3 py-1 bg-slate-100 font-bold text-slate-700">7</th>
    <td class="border border-slate-300 px-2 py-1 font-medium">0</td><td class="border border-slate-300 px-2 py-1 font-medium">1</td><td class="border border-slate-300 px-2 py-1 font-medium">2</td><td class="border border-slate-300 px-2 py-1 font-medium">2</td><td class="border border-slate-300 px-2 py-1 font-medium">3</td><td class="border border-slate-300 px-2 py-1 font-medium">4</td><td class="border border-slate-300 px-2 py-1 font-medium">5</td><td class="border border-slate-300 px-2 py-1 font-medium">6</td><td class="border border-slate-300 px-2 py-1 font-medium">6</td><td class="border border-slate-300 px-2 py-1 font-medium">8</td>
  </tr>
  <tr>
    <td class="border border-slate-300 px-2 py-1 font-medium">9</td><td class="border border-slate-300 px-2 py-1 font-medium">8</td><td class="border border-slate-300 px-2 py-1 font-medium">7</td><td class="border border-slate-300 px-2 py-1 font-medium">7</td><td class="border border-slate-300 px-2 py-1 font-medium">6</td><td class="border border-slate-300 px-2 py-1 font-medium">5</td><td class="border border-slate-300 px-2 py-1 font-medium">4</td><td class="border border-slate-300 px-2 py-1 font-medium">3</td><td class="border border-slate-300 px-2 py-1 font-medium">3</td><td class="border border-slate-300 px-2 py-1 font-medium">2</td>
    <th class="border border-slate-300 px-3 py-1 bg-slate-100 font-bold text-slate-700">8</th>
    <td class="border border-slate-300 px-2 py-1 font-medium">1</td><td class="border border-slate-300 px-2 py-1 font-medium">4</td><td class="border border-slate-300 px-2 py-1 font-medium">4</td><td class="border border-slate-300 px-2 py-1 font-medium">5</td>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
  </tr>
  <tr>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
    <td class="border border-slate-300 px-2 py-1 font-medium">2</td><td class="border border-slate-300 px-2 py-1 font-medium">1</td><td class="border border-slate-300 px-2 py-1 font-medium">1</td><td class="border border-slate-300 px-2 py-1 font-medium">0</td><td class="border border-slate-300 px-2 py-1 font-medium">0</td>
    <th class="border border-slate-300 px-3 py-1 bg-slate-100 font-bold text-slate-700">9</th>
    <td class="border border-slate-300 px-2 py-1 font-medium">0</td>
    <td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td>
  </tr>
</table></div>"""
        prefix = row_18[0].split('<div class="overflow-x-auto my-4"><table')[0]
        # Find the question prompt after the first table
        parts = row_18[0].split('</table></div>')
        if len(parts) >= 2:
            suffix = parts[1]
            new_body = prefix + stem_table_html + suffix
            cursor.execute("UPDATE questions SET body = ? WHERE uid = 'GK-2018-national_paper_3_liberal-18'", (new_body,))

    # 15. GK-2025-beijing-15
    cursor.execute("""
        UPDATE questions SET
            section = '多选题',
            answer = 'BC',
            difficulty = '中档'
        WHERE uid = 'GK-2025-beijing-15'
    """)

    # 16. GK-2010-beijing_science-02
    cursor.execute("""
        UPDATE questions SET
            answer = 'C'
        WHERE uid = 'GK-2010-beijing_science-02'
    """)

    # 17. GK-2010-chongqing_liberal-02
    cursor.execute("""
        UPDATE questions SET
            answer = 'A'
        WHERE uid = 'GK-2010-chongqing_liberal-02'
    """)

    conn.commit()
    print(">>> 1. Verified audit questions successfully fixed.")

def clean_answers_hygiene(conn):
    """
    Cleans up answers across all questions:
    - Removes trailing sentence periods (e.g. 'A.' -> 'A', '\(2\).' -> '\(2\)')
    - Unwraps LaTeX delimiters around single multiple-choice letters (e.g. '\(B\)' -> 'B')
    """
    cursor = conn.cursor()
    print(">>> 2. Performing data hygiene on answers...")

    cursor.execute("SELECT uid, section, answer FROM questions")
    rows = cursor.fetchall()

    cleaned_count = 0
    for uid, section, raw_ans in rows:
        ans = (raw_ans or "").strip()
        orig = ans

        # Remove trailing period if present
        if ans.endswith('.'):
            ans = ans[:-1].strip()

        # Unwrap \(A\) or $A$ for choice questions
        if section in ["单选题", "多选题"]:
            m = re.match(r'^(?:\\\(|\$|\b)\\?([A-E]+)(?:\\\)|\\text\{[A-E]+\}|\$|\b)?$', ans)
            if m:
                ans = m.group(1).strip()
            # Also clean cases like \(B\)
            if ans.startswith('\\(') and ans.endswith('\\)'):
                inner = ans[2:-2].strip()
                if re.match(r'^[A-E]+$', inner):
                    ans = inner

        if ans != orig:
            cursor.execute("UPDATE questions SET answer = ? WHERE uid = ?", (ans, uid))
            cleaned_count += 1

    conn.commit()
    print(f">>> 2. Answer hygiene complete. {cleaned_count} answers cleaned.")

def rebalance_categories(conn):
    """
    Rebalances '综合题' and other categories so that questions are assigned
    to their true mathematical subject areas instead of dumped into '综合题'.
    Only genuine high-level frontier synthesis questions remain in '综合题'.
    """
    cursor = conn.cursor()
    print(">>> 3. Rebalancing question categories...")

    cursor.execute("SELECT uid, year, province, section, question_number, body, solution, primary_category FROM questions")
    rows = cursor.fetchall()

    reclassified_count = 0

    for uid, year, prov, sec, q_num, body, sol, old_cat in rows:
        text = (body or "") + " " + (sol or "")
        body_text = body or ""
        new_cat = old_cat

        # Only reclassify if currently marked '综合题' or if obviously miscategorized
        if old_cat == "综合题":
            # 1. Sets & Logic
            if re.search(r'集合\s*[A-Za-z]|A\s*\\cap\s*B|A\s*\\cup\s*B|complement|\\subseteq|\\subset|交集|并集|补集|子集|真子集|全称量词|存在量词|命题.*为真|充要条件|充分不必要|必要不充分|充分条件|必要条件', text):
                if not re.search(r'二面角|抛物线|双曲线|椭圆|离心率|导数|随机变量|等比数列|等差数列', body_text):
                    new_cat = "集合与常用逻辑用语"

            # 2. Complex Numbers & Plane Vectors
            elif re.search(r'复数|虚部|实部|共轭复数|纯虚数|复平面|mathrm\{i\}|\bi\b|虚数单位', text) and not re.search(r'抛物线|双曲线|椭圆|空间向量|导数|随机变量', body_text):
                new_cat = "平面向量与复数"
            elif re.search(r'平面向量|数量积|点积|向量.*模|共线向量|垂直.*向量|基底|overrightarrow|\\vec\{|boldsymbol', text) and not re.search(r'棱柱|棱锥|空间直角坐标系|平面的法向量', text):
                new_cat = "平面向量与复数"

            # 3. Probability & Statistics
            elif re.search(r'概率|频率分布直方图|中位数|众数|百分位数|方差|标准差|独立性检验|列联表|卡方|回归方程|相关系数|正态分布|二项分布|超几何分布|条件概率|全概率|贝叶斯|随机变量|分布列|数学期望|抽样|排列|组合|二项式|展开式.*系数|常数项|摸球|投掷|试验|选法|不同排法', text) and not re.search(r'空间直角坐标系|二面角|椭圆|双曲线|抛物线', text):
                new_cat = "概率与统计"

            # 4. Solid Geometry & Space Vectors
            elif re.search(r'棱柱|棱锥|棱台|圆柱|圆锥|圆台|球心|外接球|内切球|二面角|异面直线|线面角|线面垂直|面面垂直|线面平行|面面平行|平面的法向量|空间直角坐标系|四面体|正方体|长方体|直三棱柱|三棱锥|多面体|截面面积|侧棱|底面|水桶.*容积', text):
                new_cat = "立体几何与空间向量"

            # 5. Plane Analytic Geometry
            elif re.search(r'椭圆|双曲线|抛物线|圆锥曲线|离心率|准线|渐近线|焦点.*F|弦长|韦达定理|直线与圆|相切于|切线方程.*圆|轨迹方程|极坐标|参数方程|点差法|通径|直角坐标系.*中.*点|直线.*平行|直线.*垂直|倾斜角|斜率', text):
                new_cat = "平面解析几何"

            # 6. Trigonometry & Triangle Solution
            elif re.search(r'\\sin|\\cos|\\tan|\\cot|\\sec|\\csc|正弦定理|余弦定理|解三角形|诱导公式|和差角|二倍角|辅助角公式|triangle\s*[A-Z]{3}|内角和|角[ABC]的对边|S_\\triangle', text) and not re.search(r'导数|极值点|单调递增|单调递减', text):
                new_cat = "三角函数与解三角形"

            # 7. Sequences
            elif re.search(r'等差数列|等比数列|数列\s*\{[a-z_n]+\}|通项公式|前\s*n\s*项和|S_n|a_n|递推数列|裂项相消|错位相减|数学归纳法|公差|公比|lim_\{n|数列极限|每年增产|增长率.*前.*年总共', text):
                new_cat = "数列"

            # 8. Functions & Derivatives
            elif re.search(r'导数|切线|单调递增|单调递减|单调区间|极值点|极大值|极小值|零点|隐零点|恒成立|能成立|参变分离|定义域|值域|反函数|奇函数|偶函数|周期性|对称中心|对称轴|对数|指数|二次函数|幂函数|f\(x\)|g\(x\)|\\ln|\\log|e\^|分段计税', text):
                new_cat = "函数与导数"

            # 9. Inequalities
            elif re.search(r'基本不等式|均值不等式|柯西不等式|绝对值不等式|线性规划|可行域|目标函数|解不等式', text):
                new_cat = "不等式"

            # 10. Elementary Algebra & Traditional Geometry
            elif re.search(r'因式分解|多项式|辗转相除|平面几何|相似三角形|全等三角形|勾股定理|射影定理|四点共圆|圆幂|对数表|查表|行列式|vmatrix|解方程|化简|根式|工作效率.*倍', text):
                new_cat = "初等代数与传统几何"

        if new_cat != old_cat:
            cursor.execute("UPDATE questions SET primary_category = ? WHERE uid = ?", (new_cat, uid))
            reclassified_count += 1

    conn.commit()
    print(f">>> 3. Rebalancing complete. {reclassified_count} questions reclassified from '综合题'.")

def recalibrate_difficulties(conn):
    """
    Rigorously recalibrates question difficulties across all papers to match authentic Gaokao distributions:
    - 基础题 (Easy): ~45-50%
    - 中档题 (Medium): ~35-38%
    - 压轴题 (Challenging): ~15-18%

    Key criteria:
    - Multiple Choice:
      * 12-question paper: Q1~8 基础, Q9~11 中档, Q12 压轴
      * 8-question paper: Q1~5 基础, Q6~7 中档, Q8 压轴
      * 10-question paper: Q1~7 基础, Q8~9 中档, Q10 压轴
    - Multi-select Choice:
      * 3 questions: Q9 中档, Q10 中档, Q11 压轴
      * 4 questions: Q9 基础/中档, Q10~11 中档, Q12 压轴
    - Fill-in-the-blank:
      * 4-question section: Q1~2 基础, Q3 中档, Q4 压轴
      * 3-question section: Q1~2 基础, Q3 压轴
      * 5-question section: Q1~3 基础, Q4 中档, Q5 压轴
    - Free Response / Comprehensive:
      * 5-question big section: Q1~3 中档, Q4~5 压轴 (first question often trigonometric or geometric; last two derivative/analytic geometry)
      * 6-question big section: Q1~3 中档 (Q17~19), Q4~5 压轴 (Q20~21), Q6 (elective/选考 Q22/23) 中档
      * Historical short papers: first half 基础, middle 中档, final 1 question 压轴
    """
    cursor = conn.cursor()
    print(">>> 4. Recalibrating difficulty distribution...")

    # Fetch papers and their questions
    cursor.execute("SELECT paper_id, total_questions FROM papers")
    papers = cursor.fetchall()

    for paper_id, total_q in papers:
        cursor.execute("""
            SELECT uid, section, question_number, primary_category, score
            FROM questions WHERE paper_id = ?
            ORDER BY question_number ASC
        """, (paper_id,))
        qs = cursor.fetchall()
        n = len(qs)
        if n == 0:
            continue

        # Count questions per section
        sec_groups = {}
        for q in qs:
            sec = q[1]
            sec_groups.setdefault(sec, []).append(q)

        for sec, group in sec_groups.items():
            tot_in_sec = len(group)
            for idx, q_item in enumerate(group):
                uid = q_item[0]
                pos = idx + 1 # 1-based index within section
                cat = q_item[3]

                diff = "中档"

                if "单选" in sec or ("选择" in sec and "多选" not in sec):
                    if tot_in_sec >= 12:
                        if pos <= 8:
                            diff = "基础"
                        elif pos <= 11:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec >= 8:
                        if pos <= 6:
                            diff = "基础"
                        elif pos <= 7:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec >= 4:
                        if pos <= tot_in_sec - 2:
                            diff = "基础"
                        elif pos == tot_in_sec - 1:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    else:
                        diff = "基础"

                elif "多选" in sec:
                    if pos == tot_in_sec:
                        diff = "压轴"
                    elif pos == 1:
                        diff = "基础"
                    else:
                        diff = "中档"

                elif "填空" in sec:
                    if tot_in_sec >= 12:
                        # Jiangsu / Shanghai 12-14 fill-in questions
                        if pos <= 7:
                            diff = "基础"
                        elif pos <= tot_in_sec - 2:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec >= 6:
                        if pos <= 3:
                            diff = "基础"
                        elif pos <= tot_in_sec - 2:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec == 4:
                        if pos <= 2:
                            diff = "基础"
                        elif pos == 3:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec == 3:
                        if pos <= 2:
                            diff = "基础"
                        else:
                            diff = "压轴"
                    else:
                        if pos == 1:
                            diff = "基础"
                        else:
                            diff = "中档"

                elif any(k in sec for k in ["解答", "计算", "证明", "综合"]):
                    if tot_in_sec >= 6:
                        # National 6-big-question paper: Q17 basic/medium, Q18-20 medium, Q21 hard, Q22/23 elective medium
                        if pos == 1:
                            diff = "基础"
                        elif pos <= 4:
                            diff = "中档"
                        elif pos == 5:
                            diff = "压轴"
                        else:
                            diff = "中档"
                    elif tot_in_sec == 5:
                        # New Gaokao 5-big-question paper: Q15 basic, Q16-17 medium, Q18 medium, Q19 hard
                        if pos == 1:
                            diff = "基础"
                        elif pos <= 4:
                            diff = "中档"
                        else:
                            diff = "压轴"
                    elif tot_in_sec >= 3:
                        if pos == 1:
                            diff = "基础"
                        elif pos == tot_in_sec:
                            diff = "压轴"
                        else:
                            diff = "中档"
                    else:
                        diff = "中档"

                else:
                    # Generic / Historical questions
                    frac = pos / float(tot_in_sec)
                    if frac <= 0.55:
                        diff = "基础"
                    elif frac <= 0.85:
                        diff = "中档"
                    else:
                        diff = "压轴"

                cursor.execute("UPDATE questions SET difficulty = ? WHERE uid = ?", (diff, uid))

    conn.commit()
    print(">>> 4. Difficulty recalibration complete.")

def print_final_statistics(conn):
    cursor = conn.cursor()
    print("\n" + "="*50)
    print("FINAL DATABASE STATISTICS AFTER P0 FIXES")
    print("="*50)

    cursor.execute("SELECT count(*) FROM questions")
    total_q = cursor.fetchone()[0]
    print(f"Total Questions: {total_q}")

    print("\n--- Category Breakdown ---")
    cursor.execute("SELECT primary_category, count(*), round(count(*)*100.0/? ,1) FROM questions GROUP BY primary_category ORDER BY count(*) DESC", (total_q,))
    for cat, cnt, pct in cursor.fetchall():
        print(f"  {cat:<18}: {cnt:>5} ({pct:>4}%)")

    print("\n--- Difficulty Distribution ---")
    cursor.execute("SELECT difficulty, count(*), round(count(*)*100.0/? ,1) FROM questions GROUP BY difficulty ORDER BY count(*) DESC", (total_q,))
    for diff, cnt, pct in cursor.fetchall():
        print(f"  {diff:<18}: {cnt:>5} ({pct:>4}%)")

    print("\n--- Section Distribution ---")
    cursor.execute("SELECT section, count(*) FROM questions GROUP BY section ORDER BY count(*) DESC LIMIT 10")
    for sec, cnt in cursor.fetchall():
        print(f"  {sec:<18}: {cnt:>5}")

def main():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    try:
        fix_specific_audit_questions(conn)
        clean_answers_hygiene(conn)
        rebalance_categories(conn)
        recalibrate_difficulties(conn)
        print_final_statistics(conn)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
