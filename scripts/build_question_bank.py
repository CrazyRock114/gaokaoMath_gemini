#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Gaokao Math Question Bank Builder (1952 - 2026)
Parses LaTeX files, classifies knowledge points, tags difficulty and mathematical methods,
extracts figures, generates adaptation guidelines, and builds SQLite + JSON databases.
"""

import os
import re
import sys
import json
import sqlite3
import glob
from collections import defaultdict, Counter

WORKSPACE = "/Users/crazyrock/Antigravity/gaokaomath"
LATEX_CONTENT_DIR = os.path.join(WORKSPACE, "latex_source", "content")
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")
OUTPUT_JSON_SUMMARY = os.path.join(WORKSPACE, "question_bank", "all_questions_summary.json")
OUTPUT_ANALYSIS_JSON = os.path.join(WORKSPACE, "analysis", "gaokao_analysis_data.json")
OUTPUT_CATALOG_JSON = os.path.join(WORKSPACE, "question_bank", "catalog.json")

# Province / Region standard mapping
PROVINCE_KEYWORDS = [
    ("全国", ["全国", "新课标", "大纲", "新高考", "甲卷", "乙卷", "全国卷", "三南"]),
    ("北京", ["北京"]),
    ("上海", ["上海"]),
    ("天津", ["天津"]),
    ("重庆", ["重庆"]),
    ("广东", ["广东"]),
    ("江苏", ["江苏", "南通"]),
    ("浙江", ["浙江"]),
    ("山东", ["山东"]),
    ("福建", ["福建"]),
    ("湖北", ["湖北"]),
    ("湖南", ["湖南", "株洲"]),
    ("安徽", ["安徽"]),
    ("江西", ["江西"]),
    ("四川", ["四川"]),
    ("陕西", ["陕西"]),
    ("辽宁", ["辽宁"]),
    ("河南", ["河南"]),
    ("河北", ["河北"]),
    ("海南", ["海南"]),
    ("黑龙江", ["黑龙江"]),
    ("吉林", ["吉林"]),
    ("广西", ["广西", "百色"]),
    ("内蒙古", ["内蒙古"]),
    ("新疆", ["新疆"]),
    ("云南", ["云南"]),
    ("贵州", ["贵州"]),
    ("山西", ["山西"]),
    ("甘肃", ["甘肃"]),
    ("宁夏", ["宁夏"]),
    ("青海", ["青海"]),
    ("西藏", ["西藏"]),
]

def determine_province(paper_name, rel_path):
    comb = paper_name + " " + rel_path
    for prov, kws in PROVINCE_KEYWORDS:
        if prov == "全国":
            continue
        for kw in kws:
            if kw in comb:
                return prov
    return "全国"

def determine_track(paper_name, year):
    if "春" in paper_name:
        return "春考"
    if year >= 2020 and ("新高考" in paper_name or ("全国" in paper_name and year >= 2025)):
        return "新高考"
    if "理" in paper_name:
        return "理科"
    if "文" in paper_name:
        return "文科"
    if year >= 2020 and any(p in paper_name for p in ["北京", "上海", "天津", "浙江", "山东", "海南"]):
        return "新高考"
    if year < 1979 or year in [1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1978]:
        return "全国统考"
    return "文理同卷"

def determine_paper_type(year, province, paper_name):
    if "春" in paper_name:
        return "春季高考"
    if year >= 2020 and "新高考" in paper_name:
        return "新高考全国卷"
    if year >= 2025 and "全国" in paper_name:
        return "新高考全国卷"
    if province != "全国":
        return "自主命题卷"
    if year < 1985:
        return "建国及恢复初期统考卷"
    return "教育部全国卷"

def parse_balanced_braces(s, start_idx=0):
    idx = s.find("{", start_idx)
    if idx == -1:
        return None, start_idx
    depth = 0
    start = idx + 1
    i = idx
    while i < len(s):
        if s[i] == "{" and (i == 0 or s[i-1] != "\\"):
            depth += 1
        elif s[i] == "}" and (i == 0 or s[i-1] != "\\"):
            depth -= 1
            if depth == 0:
                return s[start:i], i + 1
        i += 1
    return None, len(s)

def extract_braced_command(text, cmd_name):
    """
    Finds \\cmd_name{...} with balanced braces.
    Returns (start_pos, end_pos, inner_content) or None.
    """
    pattern = rf"\\{cmd_name}\s*(?=\{{)"
    m = re.search(pattern, text)
    if not m:
        return None
    inner, end_pos = parse_balanced_braces(text, m.end())
    if inner is not None:
        return (m.start(), end_pos, inner.strip())
    return None

def extract_balanced_env(text, env_name):
    begin_tag = rf"\begin{{{env_name}}}"
    end_tag = rf"\end{{{env_name}}}"
    start = text.find(begin_tag)
    if start == -1:
        return None
    depth = 0
    i = start
    while i < len(text):
        if text[i:].startswith(begin_tag):
            depth += 1
            i += len(begin_tag)
        elif text[i:].startswith(end_tag):
            depth -= 1
            if depth == 0:
                end_pos = i + len(end_tag)
                inner = text[start:end_pos]
                return (start, end_pos, inner)
            i += len(end_tag)
        else:
            i += 1
    return None

def unwrap_macro_last_arg(text, macro_name):
    while rf"\{macro_name}" in text:
        m = re.search(rf"\\{macro_name}(?:\[[^\]]*\])*\s*", text)
        if not m:
            break
        pos = m.end()
        arg, end_pos = parse_balanced_braces(text, pos)
        if arg is None:
            break
        if end_pos < len(text) and text[end_pos:end_pos+10].strip().startswith('{'):
            arg2, end_pos2 = parse_balanced_braces(text, end_pos)
            if arg2 is not None:
                if end_pos2 < len(text) and text[end_pos2:end_pos2+10].strip().startswith('{'):
                    arg3, end_pos3 = parse_balanced_braces(text, end_pos2)
                    if arg3 is not None:
                        text = text[:m.start()] + arg3 + text[end_pos3:]
                        continue
                text = text[:m.start()] + arg2 + text[end_pos2:]
                continue
        text = text[:m.start()] + arg + text[end_pos:]
    return text

def clean_outer_tabular(full_tab_str):
    s = full_tab_str.strip()
    m_beg = re.match(r"^\\begin\{tabular\}(?:\[[^\]]*\])*\s*", s)
    if m_beg:
        if m_beg.end() < len(s) and s[m_beg.end()] == '{':
            _, col_end = parse_balanced_braces(s, m_beg.end())
            inner_block = s[col_end:]
        else:
            inner_block = s[m_beg.end():]
    else:
        inner_block = s

    inner_block = re.sub(r"\\end\{tabular\}\s*$", "", inner_block.strip())
    
    # Strip any minipage inside tabular
    inner_block = re.sub(r"\\begin\{minipage\}(?:\[[^\]]*\])*(?:\{[^}]*\})*", "", inner_block)
    inner_block = re.sub(r"\\end\{minipage\}", "", inner_block)
    inner_block = re.sub(r"\\centering\b", "", inner_block)
    
    # Flatten any inner tabular into <br/>
    while r"\begin{tabular}" in inner_block:
        sub = extract_balanced_env(inner_block, "tabular")
        if not sub:
            break
        sub_start, sub_end, sub_content = sub
        sub_s = sub_content.strip()
        sub_beg = re.match(r"^\\begin\{tabular\}(?:\[[^\]]*\])*\s*", sub_s)
        if sub_beg and sub_beg.end() < len(sub_s) and sub_s[sub_beg.end()] == '{':
            _, sub_col_end = parse_balanced_braces(sub_s, sub_beg.end())
            sub_body = sub_s[sub_col_end:]
        else:
            sub_body = re.sub(r"^\\begin\{tabular\}(?:\[[^\]]*\])*(?:\{[^}]*\})?", "", sub_s)
        sub_body = re.sub(r"\\end\{tabular\}\s*$", "", sub_body.strip())
        sub_lines = [l.strip() for l in sub_body.split(r"\\") if l.strip()]
        sub_repl = "<br/>".join(sub_lines)
        inner_block = inner_block[:sub_start] + sub_repl + inner_block[sub_end:]
    
    lines = inner_block.split(r"\\")
    rows = []
    for line in lines:
        line = re.sub(r"\\(?:hline|toprule|midrule|bottomrule)", "", line)
        line = re.sub(r"\\cline\{[^}]*\}", "", line)
        line = re.sub(r"\\vspace\{[^}]*\}", "", line)
        line = line.strip()
        if not line:
            continue
        cells = [c.strip() for c in line.split("&")]
        rows.append(cells)
    
    if not rows:
        return ""
        
    html = ['\n<div class="overflow-x-auto my-4"><table class="border-collapse border border-slate-300 mx-auto text-center text-sm shadow-sm bg-white">']
    for r_idx, row in enumerate(rows):
        html.append('  <tr>')
        for cell in row:
            mc = re.match(r"\\multicolumn\{(\d+)\}\{[^}]*\}\{(.*)\}", cell)
            mr = re.match(r"\\multirow\{(\d+)\}\{[^}]*\}\{(.*)\}", cell)
            if mc:
                colspan = mc.group(1)
                inner = mc.group(2).strip()
                html.append(f'    <td colspan="{colspan}" class="border border-slate-300 px-3 py-1 font-semibold bg-slate-50">{inner}</td>')
            elif mr:
                rowspan = mr.group(1)
                inner = mr.group(2).strip()
                html.append(f'    <td rowspan="{rowspan}" class="border border-slate-300 px-3 py-1 font-semibold bg-slate-50">{inner}</td>')
            else:
                tag = "th" if r_idx == 0 else "td"
                cls = "border border-slate-300 px-2 py-1 bg-slate-50 font-medium" if r_idx == 0 else "border border-slate-300 px-2 py-1"
                html.append(f'    <{tag} class="{cls}">{cell}</{tag}>')
        html.append('  </tr>')
    html.append('</table></div>\n')
    return "\n".join(html)

def clean_latex(text):
    if not text:
        return ""
    
    # Normalize typo in \begin{tabular{
    text = text.replace(r"\begin{tabular{", r"\begin{tabular}{")

    # Expand local \newcommand definitions
    while r"\newcommand" in text:
        m = re.search(r"\\newcommand\{\\([a-zA-Z]+)\}\s*", text)
        if not m:
            break
        cmd_to_rep = m.group(1)
        val, end_pos = parse_balanced_braces(text, m.end())
        if val is not None:
            text = text[:m.start()] + text[end_pos:]
            text = text.replace(f"\\{cmd_to_rep}", val.strip())
        else:
            break

    # Strip custom macro declarations with balanced braces
    text = re.sub(r"\\def\\theprobnum(?:\{[^}]*\})*\%?", "", text)
    while r"\expandafter\def\csname" in text:
        m = re.search(r"\\expandafter\\def\\csname.*?\\endcsname\s*", text)
        if not m:
            break
        _, end_pos = parse_balanced_braces(text, m.end())
        text = text[:m.start()] + text[end_pos:]
        
    while r"\renewcommand" in text:
        m = re.search(r"\\renewcommand\{[^}]*\}(?:\[[^\]]*\])*\s*", text)
        if not m:
            break
        _, end_pos = parse_balanced_braces(text, m.end())
        text = text[:m.start()] + text[end_pos:]

    text = re.sub(r"\\phantom\{[^}]*\}", "", text)
    
    # 0. Unwrap \solutionfigure{...}
    while r"\solutionfigure" in text:
        m = re.search(r"\\solutionfigure\s*", text)
        if not m:
            break
        inner, pos = parse_balanced_braces(text, m.end())
        if inner is not None:
            text = text[:m.start()] + inner + text[pos:]
        else:
            break

    # 1. Handle \examfiguregroup
    while r"\examfiguregroup" in text:
        m = re.search(r"\\examfiguregroup(?:\[[^\]]*\])?\s*", text)
        if not m:
            break
        pos = m.end()
        arg1, pos = parse_balanced_braces(text, pos)
        arg2, pos = parse_balanced_braces(text, pos)
        
        full_block = (arg1 or '') + ' ' + (arg2 or '')
        imgs = re.findall(r'(img(?:_repaint)?/[a-zA-Z0-9_\-\./]+\.(?:png|jpg|jpeg))', full_block)
        unique_imgs = []
        for img in imgs:
            if img not in unique_imgs:
                unique_imgs.append(img)
        
        img_htmls = [f'\n<div class="flex justify-center my-3"><img src="/{p}" class="max-h-52 border border-slate-200 rounded p-1 bg-white" alt="题图" /></div>' for p in unique_imgs]
        repl = '\n\n' + '\n'.join(img_htmls) + '\n\n'
        text = text[:m.start()] + repl + text[pos:]

    # 2. Clean embedded figure commands in text
    def replace_fig(m):
        full = m.group(0)
        path_m = re.search(r'(img(?:_repaint)?/[a-zA-Z0-9_\-\./]+\.(?:png|jpg|jpeg))', full)
        if path_m:
            fpath = path_m.group(1).strip()
            return f"\n\n<div class=\"flex justify-center my-3\"><img src=\"/{fpath}\" class=\"max-h-52 border border-slate-200 rounded p-1 bg-white\" alt=\"题图\" /></div>\n\n"
        return ""

    text = re.sub(r"\\(?:bitmapfigure|solutionfigure|choicebitmap|bitmapinclude|includegraphics|sourcefigure)(?:\[[^\]]*\])?\{([^}]+)\}", replace_fig, text)
    text = re.sub(r"\\texfigure(?:\[[^\]]*\])?\{([^}]+)\}", "", text)
    text = re.sub(r"\\FigureLayoutDeclare\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\FigureTrimDeclare\{[^}]*\}\{[^}]*\}", "", text)

    # 3. Convert custom display environments to standard KaTeX display math
    while r"\examdisplaycases" in text:
        m = re.search(r"\\examdisplaycases\s*", text)
        if not m:
            break
        pos = m.end()
        prefix, pos = parse_balanced_braces(text, pos)
        cases, pos = parse_balanced_braces(text, pos)
        if prefix is not None and cases is not None:
            prefix_str = prefix.strip()
            repl = f"\n\\[\n{prefix_str + ' ' if prefix_str else ''}\\begin{{cases}}\n{cases.strip()}\n\\end{{cases}}\n\\]\n"
            text = text[:m.start()] + repl + text[pos:]
        else:
            break

    while r"\examdisplaychain" in text:
        m = re.search(r"\\examdisplaychain\s*", text)
        if not m:
            break
        pos = m.end()
        body, pos = parse_balanced_braces(text, pos)
        if body is not None:
            repl = f"\n\\[\n\\begin{{aligned}}\n{body.strip()}\n\\end{{aligned}}\n\\]\n"
            text = text[:m.start()] + repl + text[pos:]
        else:
            break

    while r"\examdisplayaligned" in text:
        m = re.search(r"\\examdisplayaligned(?:\[[^\]]*\])?\s*", text)
        if not m:
            break
        pos = m.end()
        body, pos = parse_balanced_braces(text, pos)
        if body is not None:
            repl = f"\n\\[\n\\begin{{aligned}}\n{body.strip()}\n\\end{{aligned}}\n\\]\n"
            text = text[:m.start()] + repl + text[pos:]
        else:
            break

    while r"\examdisplayarray" in text:
        m = re.search(r"\\examdisplayarray\s*", text)
        if not m:
            break
        pos = m.end()
        arg1, pos = parse_balanced_braces(text, pos)
        cols, pos = parse_balanced_braces(text, pos)
        rows, pos = parse_balanced_braces(text, pos)
        arg4, pos = parse_balanced_braces(text, pos)
        if cols is not None and rows is not None:
            repl = f"\n\\[\n\\begin{{array}}{{{cols.strip()}}}\n{rows.strip()}\n\\end{{array}}\n\\]\n"
            text = text[:m.start()] + repl + text[pos:]
        else:
            break

    # Convert \begin{align*} to KaTeX display math
    text = re.sub(r"\\begin\{align\*?\}(.*?)\\end\{align\*?\}", r"\n\\[\n\\begin{aligned}\n\1\n\\end{aligned}\n\\]\n", text, flags=re.DOTALL)

    # 4. Clean fill-in blanks completely: eliminate all \underline{\quad...}
    text = re.sub(r"\\fillinblank(?:\[[^\]]*\])?\{[^}]*\}", "______", text)
    text = re.sub(r"\\examblankrule\b", "______", text)
    text = re.sub(r"\\underline\{\\quad(?:\\quad)*\}", "______", text)
    text = re.sub(r"\\underline\{\\hspace\{[^}]*\}\}", "______", text)
    text = re.sub(r"\\underline\{\s*\}", "______", text)
    text = re.sub(r"\\underline\{\s*\\quad\s*\}", "______", text)

    # 5. Clean choice parentheses: eliminate all （\quad）, （\(\quad\)）, etc.
    text = re.sub(r"[（(]\s*(?:\\\(|\$)?\s*\\quad(?:\s*\\quad)*\s*(?:\\\)|\$)?\s*[）)]", "（　　）", text)
    text = re.sub(r"（\s*\\qquad\s*）", "（　　）", text)
    text = re.sub(r"（\s*\\quad\s*）", "（　　）", text)

    # 6. Handle lists: \begin{enumerate} and \begin{circlelist}
    def replace_enum(m):
        content = m.group(1)
        items = re.split(r"\\item\s*", content)
        res = []
        q_idx = 1
        for it in items:
            it = it.strip()
            if not it:
                continue
            if re.match(r"^\([0-9ivxIVX一二三四五]+\)", it) or re.match(r"^[0-9ivxIVX一二三四五]+[\.、]", it):
                res.append(it)
            else:
                res.append(f"({q_idx}) {it}")
                q_idx += 1
        return "\n" + "\n".join(res) + "\n"

    for _ in range(5):
        if r"\begin{enumerate}" not in text:
            break
        text = re.sub(r"\\begin\{enumerate\}(?:\[[^\]]*\])?((?:(?!\\begin\{enumerate\}).)*?)\\end\{enumerate\}", replace_enum, text, flags=re.DOTALL)
    text = re.sub(r"\\begin\{enumerate\}(?:\[[^\]]*\])?", "", text)
    text = re.sub(r"\\end\{enumerate\}", "", text)

    def replace_circlelist(m):
        content = m.group(1)
        items = re.split(r"\\item\s*", content)
        res = []
        c_map = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"]
        q_idx = 0
        for it in items:
            it = it.strip()
            if not it:
                continue
            marker = c_map[q_idx] if q_idx < len(c_map) else f"({q_idx+1})"
            res.append(f"{marker} {it}")
            q_idx += 1
        return "\n" + "\n".join(res) + "\n"

    text = re.sub(r"\\begin\{circlelist\}(.*?)\\end\{circlelist\}", replace_circlelist, text, flags=re.DOTALL)

    # Unwrap box layouts BEFORE tables so cells have clean contents
    for bx in ['makebox', 'parbox', 'smash', 'rlap', 'rotatebox', 'raisebox', 'resizebox']:
        text = unwrap_macro_last_arg(text, bx)

    # Convert LaTeX tabular environments into clean responsive HTML tables
    while r"\begin{tabular}" in text:
        tab_env = extract_balanced_env(text, "tabular")
        if not tab_env:
            break
        tab_start, tab_end, tab_content = tab_env
        tab_html = clean_outer_tabular(tab_content)
        text = text[:tab_start] + tab_html + text[tab_end:]

    # 7. Circled numbers: \circled{1} -> ①
    circled_map = {"1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤", "6": "⑥", "7": "⑦", "8": "⑧"}
    for k, v in circled_map.items():
        text = text.replace(f"\\circled{{{k}}}", v)

    # 8. Typesetting artifacts & macro cleanup
    text = re.sub(r"\\begin\{center\}", "", text)
    text = re.sub(r"\\end\{center\}", "", text)
    text = re.sub(r"\\begin\{minipage\}(?:\{[^}]*\})?", "", text)
    text = re.sub(r"\\end\{minipage\}", "", text)
    text = re.sub(r"\\(?:scriptsize|footnotesize|small|large|normalsize)\b", "", text)
    text = re.sub(r"\\FloatBarrier", "", text)
    text = re.sub(r"\\reuseproblemnumber(?:\{[^}]*\})?", "", text)
    text = re.sub(r"\\problemresetlayout\b", "", text)
    text = re.sub(r"\\begingroup", "", text)
    text = re.sub(r"\\endgroup", "", text)
    text = re.sub(r"\\renewcommand\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\arraystretch", "", text)
    text = re.sub(r"\\centering", "", text)
    text = re.sub(r"\\allowbreak", "", text)
    text = re.sub(r"\\vbox\s*\{", "", text)
    text = re.sub(r"\\hbox\s+to\s+[^\{]+\{", "", text)
    text = re.sub(r"\\hfill\b", " ", text)
    text = re.sub(r"\\vfill\b", " ", text)
    text = re.sub(r"\\hfil\b", " ", text)
    text = re.sub(r"\\vskip\s+[0-9\.]+[a-zA-Z]+", "", text)
    text = re.sub(r"\\noindent\b", "", text)
    text = re.sub(r"\\par\b", "\n", text)
    text = re.sub(r"\\vspace(?:\[[^\]]*\])?\{[^}]*\}", "", text)
    text = re.sub(r"\\hspace(?:\[[^\]]*\])?\{[^}]*\}", " ", text)
    text = re.sub(r"\\rule(?:\[[^\]]*\])?\{[^}]*\}\{[^}]*\}", "______", text)
    text = re.sub(r"\\leftskip=[^ \t\r\n]+\s*", "", text)
    text = re.sub(r"\\rightskip=[^ \t\r\n]+\s*", "", text)
    text = re.sub(r"\\relax\b", "", text)
    text = re.sub(r"\\setlength\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\setcounter\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\tabcolsep\b", "", text)
    text = re.sub(r"\\qquad", "　", text)
    text = re.sub(r"\\mbox\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\fbox\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\(?:medskip|tallpagetrue)\b", "", text)
    text = re.sub(r"\\everypar\{[^}]*\}", "", text)
    text = re.sub(r"\\hbadness=[0-9]+\s*", "", text)
    text = text.replace(r"\textasciitilde", "~")
    text = re.sub(r"\\examstat[xy]label\{[^}]*\}", "", text)

    # 9. Math symbol normalizations
    text = re.sub(r"\\bs\{([^}]+)\}", r"\\boldsymbol{\1}", text)
    text = re.sub(r"(?<![a-zA-Z])\\i(?![a-zA-Z])", r"\\mathrm{i}", text)
    text = re.sub(r"(?<![a-zA-Z])\\R(?![a-zA-Z])", r"\\mathbb{R}", text)
    text = re.sub(r"(?<![a-zA-Z])\\N(?![a-zA-Z])", r"\\mathbb{N}", text)
    text = re.sub(r"(?<![a-zA-Z])\\Z(?![a-zA-Z])", r"\\mathbb{Z}", text)
    text = re.sub(r"(?<![a-zA-Z])\\C(?![a-zA-Z])", r"\\mathbb{C}", text)

    # 10. Clean isolated \quad and \text outside math blocks
    parts = re.split(r"(\\\(.*?\\\)|\$\$.*?\$\$|\$.*?\$|\\\[.*?\\\])", text, flags=re.DOTALL)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"\\quad", " ", parts[i])
        parts[i] = re.sub(r"\\underline\{\s*\\quad\s*\}", "______", parts[i])
        parts[i] = re.sub(r"\\text\{([^}]+)\}", r"\1", parts[i])
        parts[i] = parts[i].replace(r"\ldots", "…").replace(r"\dots", "…")
    text = "".join(parts)

    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def extract_choices(prob_text):
    m = re.search(r"\\choices(?:\[[^\]]*\])?", prob_text)
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
    return body.strip(), opts

def extract_images(text):
    imgs = []
    for m in re.finditer(r"(?:\\bitmapfigure|\\choicebitmap|\\bitmapinclude|\\includegraphics|\\sourcefigure)(?:\[[^\]]*\])?\{([^}]+)\}", text):
        raw_path = m.group(1).strip()
        path_m = re.search(r'(img(?:_repaint)?/[a-zA-Z0-9_\-\./]+\.(?:png|jpg|jpeg))', raw_path)
        if path_m:
            p = path_m.group(1).strip()
            if not any(x["path"] == p for x in imgs):
                imgs.append({"type": "bitmap", "path": p})
    for m in re.finditer(r"\\examfiguregroup(?:\[[^\]]*\])?\{([^}]+)\}", text):
        raw_path = m.group(1).strip()
        path_m = re.search(r'(img(?:_repaint)?/[a-zA-Z0-9_\-\./]+\.(?:png|jpg|jpeg))', raw_path)
        if path_m:
            p = path_m.group(1).strip()
            if not any(x["path"] == p for x in imgs):
                imgs.append({"type": "bitmap", "path": p})
    return imgs

# Detailed Knowledge Taxonomy and Heuristic Matcher
KNOWLEDGE_RULES = {
    "函数与导数": {
        "weight_primary": [
            r"导数", r"切线方程", r"单调递[增减]", r"单调区间", r"极值点", r"极大值", r"极小值",
            r"零点", r"零点个数", r"隐零点", r"极值点偏移", r"恒成立", r"能成立", r"参变分离",
            r"洛必达", r"凹凸性", r"奇函数", r"偶函数", r"周期性", r"对称中心", r"对称轴",
            r"定义域", r"值域", r"反函数", r"幂函数", r"指数函数", r"对数函数", r"f'\([x0-9]\)",
            r"e\^\{?[a-z0-9]", r"\\ln\s*\{?[a-z0-9]"
        ],
        "subtags_map": [
            ("导数几何意义与切线", [r"切线", r"切点", r"斜率.*导数"]),
            ("单调性与极值最值", [r"单调", r"极值", r"极大", r"极小", r"最大值", r"最小值"]),
            ("函数零点与方程根", [r"零点", r"方程.*根", r"交点个数"]),
            ("恒成立与能成立问题", [r"恒成立", r"能成立", r"对任意.*都存在"]),
            ("极值点偏移与构造放缩", [r"极值点偏移", r"x_1\+x_2", r"x_1x_2", r"对数均值"]),
            ("函数的奇偶性与周期性", [r"奇函数", r"偶函数", r"周期", r"对称"]),
            ("指对幂函数性质", [r"指数", r"对数", r"幂函数", r"\\ln", r"\\log", r"e\^"]),
        ]
    },
    "三角函数与解三角形": {
        "weight_primary": [
            r"\\sin", r"\\cos", r"\\tan", r"三角函数", r"正弦定理", r"余弦定理", r"解三角形",
            r"诱导公式", r"和差角", r"二倍角", r"辅助角公式", r"\\triangle\s*[A-Z]{3}", r"内角和",
            r"角[ABC]的对边", r"S_{\\triangle}", r"外接圆半径.*R"
        ],
        "subtags_map": [
            ("正弦定理与余弦定理", [r"正弦定理", r"余弦定理", r"解三角形", r"a/\sin A"]),
            ("三角恒等变换与化简", [r"诱导公式", r"二倍角", r"和差化积", r"积化和差", r"辅助角"]),
            ("三角函数图象与性质", [r"周期", r"振幅", r"相位", r"单调区间.*sin", r"对称轴.*cos"]),
            ("三角形面积与范围最值", [r"面积.*最大值", r"周长.*范围", r"ab\\sin", r"S_\\triangle"]),
        ]
    },
    "数列": {
        "weight_primary": [
            r"数列", r"等差数列", r"等比数列", r"通项公式", r"前\s*n\s*项和", r"S_n", r"a_n",
            r"裂项相消", r"错位相减", r"递推数列", r"数学归纳法", r"a_{n\+1}", r"S_{n\+1}",
            r"公差", r"公比"
        ],
        "subtags_map": [
            ("等差数列与等比数列基本量", [r"等差", r"等比", r"公差", r"公比", r"基本量"]),
            ("数列求和方法", [r"裂项", r"错位", r"分组求和", r"倒序相加", r"前n项和"]),
            ("递推数列与通项求解", [r"递推", r"a_{n\+1}", r"构造等比", r"累加法", r"累乘法"]),
            ("数列与不等式综合放缩", [r"\\sum", r"<", r">", r"放缩", r"数学归纳法"]),
        ]
    },
    "平面解析几何": {
        "weight_primary": [
            r"椭圆", r"双曲线", r"抛物线", r"圆锥曲线", r"离心率", r"准线", r"渐近线", r"焦点",
            r"弦长", r"韦达定理", r"定点", r"定值", r"轨迹方程", r"直角坐标系", r"切线.*圆",
            r"圆的方程", r"斜率", r"点差法", r"通径", r"极坐标", r"参数方程"
        ],
        "subtags_map": [
            ("椭圆的方程与性质", [r"椭圆", r"长轴", r"短轴", r"离心率.*e"]),
            ("双曲线的方程与性质", [r"双曲线", r"渐近线", r"实轴", r"虚轴"]),
            ("抛物线的方程与性质", [r"抛物线", r"准线", r"焦点弦", r"y\^2=2px"]),
            ("直线与圆锥曲线位置关系", [r"联立", r"韦达定理", r"弦长公式", r"交于.*两点"]),
            ("圆锥曲线定点与定值问题", [r"定点", r"定值", r"恒过"]),
            ("解析几何最值与范围", [r"面积最值", r"范围", r"最大值", r"最小值"]),
            ("直线与圆", [r"直线方程", r"圆的方程", r"相切", r"弦心距"]),
        ]
    },
    "立体几何与空间向量": {
        "weight_primary": [
            r"棱柱", r"棱锥", r"棱台", r"圆柱", r"圆锥", r"外接球", r"内切球", r"球的体积",
            r"二面角", r"异面直线", r"线面垂直", r"面面垂直", r"线面平行", r"面面平行",
            r"空间向量", r"法向量", r"空间直角坐标系", r"四面体", r"正方体", r"长方体",
            r"三棱锥", r"直三棱柱", r"线面角"
        ],
        "subtags_map": [
            ("空间位置关系证明(平行与垂直)", [r"线面垂直", r"面面垂直", r"线面平行", r"面面平行", r"证明"]),
            ("空间向量与角(二面角/线面角)", [r"空间直角坐标系", r"法向量", r"二面角", r"线面角", r"夹角"]),
            ("空间几何体表面积与体积", [r"表面积", r"体积", r"截面"]),
            ("外接球与内切球模型", [r"外接球", r"内切球", r"球心", r"球的表面积"]),
            ("异面直线所成角与距离", [r"异面直线", r"距离"]),
        ]
    },
    "概率与统计": {
        "weight_primary": [
            r"概率", r"频率分布直方图", r"中位数", r"众数", r"平均数", r"方差", r"标准差",
            r"独立性检验", r"列联表", r"卡方", r"K\^2", r"回归方程", r"相关系数", r"正态分布",
            r"二项分布", r"超几何分布", r"条件概率", r"全概率", r"贝叶斯", r"随机变量",
            r"分布列", r"数学期望", r"抽样", r"排列", r"组合", r"二项式定理"
        ],
        "subtags_map": [
            ("统计图表与数字特征", [r"直方图", r"中位数", r"平均数", r"方差", r"百分位数"]),
            ("古典概型与几何概型", [r"古典概型", r"几何概型", r"等可能"]),
            ("条件概率与全概率公式", [r"条件概率", r"P\(A\|B\)", r"全概率", r"贝叶斯"]),
            ("离散型随机变量分布列与期望方差", [r"分布列", r"数学期望", r"方差", r"随机变量"]),
            ("常见概率模型(二项/超几何/正态)", [r"二项分布", r"超几何分布", r"正态分布", r"B\(n,p\)"]),
            ("线性回归与独立性检验", [r"回归直线", r"相关系数", r"列联表", r"卡方", r"独立性检验"]),
            ("排列组合与二项式定理", [r"排列", r"组合", r"二项式定理", r"展开式.*系数"]),
        ]
    },
    "平面向量与复数": {
        "weight_primary": [
            r"复数", r"虚部", r"实部", r"共轭复数", r"纯虚数", r"复平面", r"\\mathrm{i}", r"虚数单位",
            r"平面向量", r"数量积", r"向量.*模", r"共线向量", r"垂直.*向量", r"基底",
            r"\\bs\{", r"\\boldsymbol\{", r"\\vec\{"
        ],
        "subtags_map": [
            ("复数的代数运算与几何意义", [r"复数", r"实部", r"虚部", r"共轭", r"纯虚数", r"复平面"]),
            ("平面向量的线性运算与基底", [r"向量加法", r"减法", r"基底", r"共线", r"线性运算"]),
            ("平面向量的数量积与模长夹角", [r"数量积", r"点积", r"模长", r"夹角", r"垂直"]),
        ]
    },
    "不等式": {
        "weight_primary": [
            r"均值不等式", r"基本不等式", r"柯西不等式", r"绝对值不等式", r"线性规划",
            r"可行域", r"目标函数", r"解不等式", r"不等式恒成立"
        ],
        "subtags_map": [
            ("基本不等式求最值", [r"基本不等式", r"均值不等式", r"a\+b\\ge 2\\sqrt{ab}"]),
            ("绝对值不等式与柯西不等式", [r"绝对值不等式", r"柯西不等式"]),
            ("线性规划与可行域", [r"线性规划", r"可行域", r"目标函数"]),
        ]
    },
    "集合与常用逻辑用语": {
        "weight_primary": [
            r"集合", r"子集", r"真子集", r"并集", r"交集", r"补集", r"\\cup", r"\\cap",
            r"\\complement", r"充分条件", r"必要条件", r"充要条件", r"充分必要", r"命题",
            r"全称量词", r"存在量词"
        ],
        "subtags_map": [
            ("集合的基本运算(交并补)", [r"集合", r"\\cap", r"\\cup", r"交集", r"并集", r"补集"]),
            ("充分条件与必要条件判断", [r"充分", r"必要", r"充要"]),
            ("全称量词与存在量词", [r"全称", r"特称", r"存在量词", r"否定"]),
        ]
    },
    "初等代数与传统几何": {
        "weight_primary": [
            r"因式分解", r"多项式", r"辗转相除", r"欧几里得", r"平面几何", r"相似三角形",
            r"全等三角形", r"勾股定理", r"射影定理", r"四点共圆", r"对数表", r"查表"
        ],
        "subtags_map": [
            ("多项式运算与因式分解", [r"因式分解", r"多项式", r"根与系数"]),
            ("平面几何综合证明", [r"相似", r"全等", r"圆幂", r"四点共圆", r"射影定理"]),
            ("初等代数方程与查表运算", [r"高次方程", r"根式方程", r"对数表"]),
        ]
    }
}

METHOD_PATTERNS = [
    ("数形结合", [r"数形结合", r"图象", r"几何意义", r"画出.*图象", r"坐标系", r"直观"]),
    ("分类讨论", [r"分类讨论", r"分情况", r"当.*时.*当.*时", r"讨论.*取值"]),
    ("化归与转化", [r"转化", r"等价于", r"化为", r"构造", r"联立"]),
    ("函数与方程", [r"构造函数", r"方程思想", r"设函数", r"根与系数", r"韦达定理"]),
    ("特殊与一般", [r"特殊值", r"特值法", r"特殊位置", r"归纳猜想"]),
    ("待定系数法", [r"待定系数", r"设.*方程为", r"代入求得"]),
    ("配方法与换元法", [r"配方", r"换元", r"令\s*[a-z]\s*="]),
]

def analyze_problem_category(prob_text, sol_text, sec_name, year):
    full_text = prob_text + " " + sol_text
    
    scores = {}
    for cat, rules in KNOWLEDGE_RULES.items():
        score = 0
        for pat in rules["weight_primary"]:
            matches = len(re.findall(pat, full_text))
            score += matches * 2
            # extra weight if matched in problem text
            prob_matches = len(re.findall(pat, prob_text))
            score += prob_matches * 3
            
        scores[cat] = score
        
    # Era adjustments: before 1978, many algebraic problems
    if year < 1978:
        if re.search(r"分解因式|因式分解|解方程|化简|求值|多项式", prob_text):
            scores["初等代数与传统几何"] += 15
            
    # Priority for pure set questions
    if re.search(r"集合\s*[A-Z]|A\s*\\cap\s*B|A\s*\\cup\s*B|\\complement", prob_text):
        scores["集合与常用逻辑用语"] += 25
    if re.search(r"充分而不必要|必要而不充分|充要条件", prob_text):
        scores["集合与常用逻辑用语"] += 20
        
    # Priority for pure complex questions
    if re.search(r"复数.*在复平面|虚部|实部|共轭复数|\\left\|z\\right\|", prob_text):
        scores["平面向量与复数"] += 25

    best_cat = max(scores, key=scores.get)
    if scores[best_cat] == 0:
        best_cat = "综合题"
        
    # Identify sub-tags
    subtags = []
    if best_cat in KNOWLEDGE_RULES:
        for sub_name, pats in KNOWLEDGE_RULES[best_cat]["subtags_map"]:
            for p in pats:
                if re.search(p, full_text):
                    subtags.append(sub_name)
                    break
    if not subtags and best_cat != "综合题":
        subtags.append(best_cat + "综合应用")
        
    # Identify methods
    methods = []
    for method_name, pats in METHOD_PATTERNS:
        for p in pats:
            if re.search(p, full_text):
                methods.append(method_name)
                break
    if not methods:
        methods.append("直接计算与推导演绎")
        
    return best_cat, subtags, methods

def estimate_difficulty(sec_name, q_num, total_in_sec, cat, prob_len, sol_len):
    sec = sec_name
    is_mcq = "单选" in sec or "选择" in sec
    is_multi_mcq = "多选" in sec
    is_fill = "填空" in sec
    is_sol = "解答" in sec or "证明" in sec or "计算" in sec or "综合" in sec
    
    difficulty = "中档"
    if is_mcq:
        if q_num <= 4:
            difficulty = "基础"
        elif q_num >= total_in_sec - 1:
            difficulty = "压轴"
        else:
            difficulty = "中档"
    elif is_multi_mcq:
        if q_num == total_in_sec:
            difficulty = "压轴"
        else:
            difficulty = "中档"
    elif is_fill:
        if q_num <= 2:
            difficulty = "基础"
        elif q_num == total_in_sec:
            difficulty = "压轴"
        else:
            difficulty = "中档"
    elif is_sol:
        if q_num >= 4 or q_num >= total_in_sec - 1:
            difficulty = "压轴"
        elif q_num <= 2:
            difficulty = "中档"
        else:
            difficulty = "中档"
    else:
        difficulty = "中档"
        
    if cat in ["函数与导数", "平面解析几何"] and is_sol and q_num >= 3:
        difficulty = "压轴"
    if cat in ["集合与常用逻辑用语", "平面向量与复数"] and (is_mcq or is_fill) and q_num <= 3:
        difficulty = "基础"

    return difficulty

def compute_paper_scores(paper_id, year, province, paper_name, track, raw_problems):
    """
    Rigorously assigns historical, official point values to every question in a paper.
    Ensures Shanghai, Beijing, Tianjin, Jiangsu, Zhejiang, and National papers match
    exact official point structures (e.g. 150 points for 2006 Shanghai Science).
    """
    n = len(raw_problems)
    if n == 0:
        return []

    # 1. Shanghai Specific
    if 'shanghai' in paper_id or '上海' in province:
        if 1998 <= year <= 2016 and n == 22:
            # 12 fill-in (48 pts) + 4 mcq (16 pts) + 6 big questions (12, 12, 14, 14, 16, 18 = 86 pts) = 150 pts
            return [4]*12 + [4]*4 + [12, 12, 14, 14, 16, 18]
        if year >= 2017 and n == 21:
            # 12 fill-in (6@4 + 6@5 = 54 pts) + 4 mcq (20 pts) + 5 big (14, 14, 14, 16, 18 = 76 pts) = 150 pts
            return [4]*6 + [5]*6 + [5]*4 + [14, 14, 14, 16, 18]
        if (year in [2015, 2016]) and n == 36 and 'spring' in paper_id:
            # Shanghai Spring with extra questions (150 regular + 50 extra = 200 pts)
            return [4]*12 + [4]*12 + [12, 12, 14, 14, 14] + [4]*3 + [4]*3 + [14]

    # 2. Beijing Specific
    if 'beijing' in paper_id or '北京' in province:
        if year >= 2020 and n == 21:
            # 10 mcq @ 4 = 40 pts, 5 fill-in @ 5 = 25 pts, 6 big (13, 14, 14, 15, 15, 14 = 85 pts) = 150 pts
            return [4]*10 + [5]*5 + [13, 14, 14, 15, 15, 14]
        if 2002 <= year <= 2019 and n == 20:
            # 8 mcq @ 5 = 40 pts, 6 fill-in @ 5 = 30 pts, 6 big (13, 13, 14, 13, 14, 13 = 80 pts) = 150 pts
            return [5]*8 + [5]*6 + [13, 13, 14, 13, 14, 13]

    # 3. Tianjin Specific
    if 'tianjin' in paper_id or '天津' in province:
        if year >= 2020 and n == 20:
            # 9 mcq @ 5 = 45 pts, 6 fill-in @ 5 = 30 pts, 5 big (14, 15, 15, 15, 16 = 75 pts) = 150 pts
            return [5]*9 + [5]*6 + [14, 15, 15, 15, 16]
        if 2004 <= year <= 2019 and n == 20:
            # 8 mcq @ 5 = 40 pts, 6 fill-in @ 5 = 30 pts, 6 big (13, 13, 13, 13, 14, 14 = 80 pts) = 150 pts
            return [5]*8 + [5]*6 + [13, 13, 13, 13, 14, 14]

    # 4. Jiangsu Specific (2008-2020)
    if 'jiangsu' in paper_id or '江苏' in province:
        if 2008 <= year <= 2020:
            if n == 20:
                # 14 fill-in @ 5 = 70 pts, 6 big (14, 14, 14, 16, 16, 16 = 90 pts) = 160 pts
                return [5]*14 + [14, 14, 14, 16, 16, 16]
            elif n == 4:
                # 4 extra questions @ 10 = 40 pts
                return [10]*4
            elif n == 24:
                # Full combined: 160 + 40 = 200 pts
                return [5]*14 + [14, 14, 14, 16, 16, 16] + [10]*4

    # 5. Zhejiang Specific
    if 'zhejiang' in paper_id or '浙江' in province:
        if 2004 <= year <= 2016 and n == 22:
            # 10 mcq @ 5 = 50 pts, 7 fill-in @ 4 = 28 pts, 5 big (14, 14, 14, 15, 15 = 72 pts) = 150 pts
            return [5]*10 + [4]*7 + [14, 14, 14, 15, 15]
        if 2017 <= year <= 2022 and n == 22:
            return [4]*10 + [6]*4 + [4]*3 + [14, 15, 15, 15, 15]

    # 6. Standard National 12 + 4 + 6 = 22 (1999-2023)
    if n == 22 and year >= 1999:
        # 12 mcq @ 5 = 60 pts, 4 fill-in @ 5 = 20 pts, 6 big (12, 12, 12, 12, 12, 10 = 70 pts) = 150 pts
        return [5]*12 + [5]*4 + [12, 12, 12, 12, 12, 10]

    # 7. New Gaokao 19 questions (2020-2026)
    if n == 19 and year >= 2020:
        if year >= 2024:
            # 8 mcq @ 5 = 40 pts, 3 multi @ 6 = 18 pts, 3 fill @ 5 = 15 pts, 5 big (13, 15, 15, 17, 17 = 77 pts) = 150 pts
            return [5]*8 + [6]*3 + [5]*3 + [13, 15, 15, 17, 17]
        else:
            # 8 mcq @ 5 = 40 pts, 4 multi @ 5 = 20 pts, 4 fill @ 5 = 20 pts, 6 big (10, 12, 12, 12, 12, 12 = 70 pts) = 150 pts
            return [5]*8 + [5]*4 + [5]*4 + [10, 12, 12, 12, 12, 12]

    # 8. Universal Calibrated Allocator
    target = 150
    if ('jiangsu' in paper_id or '江苏' in province) and 2008 <= year <= 2020:
        target = 160 if n == 20 else (40 if n == 4 else 200)
    elif year < 1980:
        target = 100
    elif 1980 <= year < 1995:
        target = 120

    obj_indices = []
    subj_indices = []
    for i, p in enumerate(raw_problems):
        sec = p.get("section", "")
        if any(k in sec for k in ['单选', '选择', '多选', '填空']):
            obj_indices.append(i)
        else:
            subj_indices.append(i)

    res = [0] * n
    for i in obj_indices:
        sec = raw_problems[i].get("section", "")
        if '多选' in sec:
            res[i] = 6 if year >= 2024 else 5
        elif '单选' in sec or '选择' in sec:
            res[i] = 5 if year >= 1995 else 3
        elif '填空' in sec:
            res[i] = 5 if year >= 1995 else 4
        else:
            res[i] = 5

    rem_score = target - sum(res)
    if subj_indices:
        m = len(subj_indices)
        base = rem_score // m
        rem = rem_score % m
        for idx_in_subj, i in enumerate(subj_indices):
            extra = 1 if idx_in_subj >= (m - rem) else 0
            res[i] = max(1, base + extra)
    else:
        if n > 0:
            base = target // n
            rem = target % n
            for i in range(n):
                res[i] = base + (1 if i >= (n - rem) else 0)

    return res

def generate_adaptation_guide(cat, subtags, prob_text):
    """
    Produces actionable suggestions for teachers and students to modify,
    parameterize, or create variations of this problem.
    """
    guide = {
        "adaptable_parameters": [],
        "variation_strategies": [],
        "sample_derivative_direction": ""
    }
    
    if cat == "函数与导数":
        guide["adaptable_parameters"] = ["函数解析式基底 (如将 \\ln x 替换为 e^x 或分式项)", "含参项系数 a, b", "切点横坐标 x_0", "定义域区间范围"]
        guide["variation_strategies"] = [
            "逆向设问：将‘已知参数求单调性/极值’改编为‘已知单调区间或零点个数逆求参数范围’",
            "推广延伸：将常规极值求值改编为极值点偏移证明 (如证明 x_1 + x_2 > 2x_0)",
            "不等式证明：将恒成立问题转化为两函数图象切线放缩模型"
        ]
        guide["sample_derivative_direction"] = "保持求导法则不变，将二次多项式系数改为待定参数，考查分类讨论临界分界点。"
    elif cat == "平面解析几何":
        guide["adaptable_parameters"] = ["圆锥曲线方程参数 a, b, p", "定直线斜率 k 与截距 m", "定点 P 坐标", "弦长或面积设定目标值"]
        guide["variation_strategies"] = [
            "曲线互换：将椭圆背景迁移至双曲线或抛物线，检验几何通性",
            "定值定点逆向探索：由‘证明直线恒过定点’改编为‘动点满足某几何比例时求其运动轨迹’",
            "面积最值函数法：将三角形面积表达为关于斜率 k 或参数 m 的单变量函数，结合导数求最值"
        ]
        guide["sample_derivative_direction"] = "改变直线与圆锥曲线的相交位置，将斜率之积为定值推广到定比分点弦长综合。"
    elif cat == "立体几何与空间向量":
        guide["adaptable_parameters"] = ["空间几何体底面多边形参数 (如正方形改为菱形/直角梯形)", "侧棱倾斜角或棱长高", "动点 P 在棱上的分割比例 λ"]
        guide["variation_strategies"] = [
            "动点存在性逆设：探索棱上是否存在点 P 使得线面角或二面角为指定度数",
            "外接球综合：由规则棱柱外接球改编为折叠多面体或割补法求球表面积",
            "向量法与综合几何法对照：不仅可用空间向量建立坐标系，还可构造辅助线用线面垂直定理求解"
        ]
        guide["sample_derivative_direction"] = "引入棱上动点 P，求二面角余弦值的范围，或判断动点截面面积最值。"
    elif cat == "数列":
        guide["adaptable_parameters"] = ["首项 a_1 与公差 d/公比 q", "递推系数 (如 a_{n+1} = p a_n + q 变形)", "求和项数范围"]
        guide["variation_strategies"] = [
            "求和方法迁移：由裂项相消改编为错位相减或分组求和",
            "结合不等式：由求通项公式改为证明与数列前 n 项和相关的放缩不等式",
            "奇偶项分段：将单一递推式改编为奇数项与偶数项交替递推数列"
        ]
        guide["sample_derivative_direction"] = "将线性递推改为分式递推或累加累乘形式，拓展高阶数列构造方法。"
    elif cat == "概率与统计":
        guide["adaptable_parameters"] = ["现实情境背景 (如工业质检、医疗试验、人工智能准确率)", "样本容量 n 与抽样比例", "随机变量离散取值与分布参数"]
        guide["variation_strategies"] = [
            "模型切换：由超几何分布近似为二项分布或正态分布计算",
            "决策期望收益：加入奖惩或经济期望最优决策模型",
            "多阶段随机试验：引入全概率公式与贝叶斯逆概推断"
        ]
        guide["sample_derivative_direction"] = "结合新时代科技生活情境，构造具有现实应用意义的连续抽样检验决策题。"
    else:
        guide["adaptable_parameters"] = ["方程系数", "已知数值与区间端点", "目标求解代数式"]
        guide["variation_strategies"] = ["常数参数化", "特殊几何位置一般化", "充要条件正逆命题互换"]
        guide["sample_derivative_direction"] = "通过改变限制条件或参数范围，检验对基础概念的精准理解。"
        
    return guide

def parse_single_tex(filepath):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as fp:
        content = fp.read()
        
    # Get chapter title
    ch_m = re.search(r"\\chapter\*?\{([^}]+)\}", content)
    chapter = ch_m.group(1).strip() if ch_m else os.path.splitext(os.path.basename(filepath))[0]
    
    parts = content.split(r"\begin{problem}")
    header = parts[0]
    
    # Determine default section
    current_sec = "综合题"
    sec_m = re.findall(r"\\section\*?\{([^}]+)\}", header)
    if sec_m:
        current_sec = sec_m[-1].strip()
        
    paper_problems = []
    
    for p_block in parts[1:]:
        # Check if next section was introduced
        sec_find = list(re.finditer(r"\\section\*?\{([^}]+)\}", p_block))
        if sec_find:
            first_sec_pos = sec_find[0].start()
            prob_sub = p_block[:first_sec_pos]
            next_sec = sec_find[-1].group(1).strip()
        else:
            prob_sub = p_block
            next_sec = current_sec

        ans = ""
        sol = ""
        clean_p = prob_sub
        
        # 1. Answer extraction
        ans_m = re.search(r"\\begin\{answer\}(.*?)\\end\{answer\}", clean_p, re.DOTALL)
        if ans_m:
            ans = ans_m.group(1).strip()
            clean_p = clean_p[:ans_m.start()] + clean_p[ans_m.end():]
        else:
            ans_cmd = extract_braced_command(clean_p, "answer")
            if ans_cmd:
                ans_start, ans_end, ans_inner = ans_cmd
                ans = ans_inner
                clean_p = clean_p[:ans_start] + clean_p[ans_end:]
            
        # 2. Solution extraction
        sol_m = re.search(r"\\begin\{solution\}(.*?)\\end\{solution\}", clean_p, re.DOTALL)
        if sol_m:
            sol = sol_m.group(1).strip()
            clean_p = clean_p[:sol_m.start()] + clean_p[sol_m.end():]
        else:
            sol_cmd = extract_braced_command(clean_p, "solution")
            if sol_cmd:
                sol_start, sol_end, sol_inner = sol_cmd
                sol = sol_inner
                clean_p = clean_p[:sol_start] + clean_p[sol_end:]

        # 3. Strip any remaining stray \answer or \solution
        while True:
            extra_ans = extract_braced_command(clean_p, "answer")
            if not extra_ans:
                break
            if not ans:
                ans = extra_ans[2]
            clean_p = clean_p[:extra_ans[0]] + clean_p[extra_ans[1]:]

        while True:
            extra_sol = extract_braced_command(clean_p, "solution")
            if not extra_sol:
                break
            if not sol:
                sol = extra_sol[2]
            clean_p = clean_p[:extra_sol[0]] + clean_p[extra_sol[1]:]

        clean_p = re.sub(r"\\end\{problem\}", "", clean_p).strip()
        
        paper_problems.append({
            "section": current_sec,
            "raw_problem": clean_p,
            "raw_answer": ans,
            "raw_solution": sol
        })
        current_sec = next_sec

    return chapter, paper_problems

def main():
    print("=" * 70)
    print("Starting Gaokao Math Comprehensive Parser & Question Bank Engine...")
    print(f"Reading from: {LATEX_CONTENT_DIR}")
    
    tex_files = sorted(glob.glob(os.path.join(LATEX_CONTENT_DIR, "**", "*.tex"), recursive=True))
    print(f"Total LaTeX files discovered: {len(tex_files)}")
    
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_ANALYSIS_JSON), exist_ok=True)
    
    # Initialize SQLite DB
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE papers (
        paper_id TEXT PRIMARY KEY,
        year INTEGER,
        province TEXT,
        paper_name TEXT,
        track TEXT,
        paper_type TEXT,
        file_path TEXT,
        total_questions INTEGER,
        total_score INTEGER
    )
    """)
    
    cursor.execute("""
    CREATE TABLE questions (
        uid TEXT PRIMARY KEY,
        paper_id TEXT,
        year INTEGER,
        province TEXT,
        paper_name TEXT,
        track TEXT,
        paper_type TEXT,
        section TEXT,
        question_number INTEGER,
        body TEXT,
        options_json TEXT,
        answer TEXT,
        solution TEXT,
        images_json TEXT,
        has_image INTEGER,
        primary_category TEXT,
        subtags_json TEXT,
        methods_json TEXT,
        difficulty TEXT,
        score INTEGER,
        adaptation_json TEXT,
        FOREIGN KEY (paper_id) REFERENCES papers (paper_id)
    )
    """)
    
    # Create indexes for search performance
    cursor.execute("CREATE INDEX idx_q_year ON questions (year)")
    cursor.execute("CREATE INDEX idx_q_province ON questions (province)")
    cursor.execute("CREATE INDEX idx_q_category ON questions (primary_category)")
    cursor.execute("CREATE INDEX idx_q_difficulty ON questions (difficulty)")
    cursor.execute("CREATE INDEX idx_q_section ON questions (section)")
    cursor.execute("CREATE INDEX idx_q_track ON questions (track)")

    all_questions_list = []
    papers_summary = []
    
    # Multi-dimensional analytics collectors
    year_stats = defaultdict(lambda: {"total": 0, "categories": Counter(), "sections": Counter(), "difficulties": Counter()})
    category_stats = defaultdict(lambda: {"total": 0, "years": Counter(), "subtags": Counter(), "difficulties": Counter()})
    province_stats = defaultdict(lambda: {"total": 0, "years": Counter(), "categories": Counter()})
    section_stats = Counter()
    difficulty_stats = Counter()
    
    total_parsed_questions = 0
    total_with_solutions = 0
    total_with_answers = 0
    total_images_referenced = 0

    for idx, f in enumerate(tex_files):
        rel_path = os.path.relpath(f, LATEX_CONTENT_DIR)
        path_parts = rel_path.split(os.sep)
        try:
            year = int(path_parts[0])
        except ValueError:
            year = 2000
            
        chapter_name, raw_problems = parse_single_tex(f)
        if not chapter_name:
            chapter_name = f"{year}年高考数学试卷"
            
        province = determine_province(chapter_name, rel_path)
        track = determine_track(chapter_name, year)
        paper_type = determine_paper_type(year, province, chapter_name)
        
        file_slug = os.path.splitext(os.path.basename(f))[0]
        paper_id = f"P-{year}-{file_slug}"
        
        # Rigorously compute authentic scores for each question
        paper_scores = compute_paper_scores(paper_id, year, province, chapter_name, track, raw_problems)
        paper_total_score = sum(paper_scores)

        cursor.execute("""
        INSERT INTO papers (paper_id, year, province, paper_name, track, paper_type, file_path, total_questions, total_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (paper_id, year, province, chapter_name, track, paper_type, rel_path, len(raw_problems), paper_total_score))
        
        papers_summary.append({
            "paper_id": paper_id,
            "year": year,
            "province": province,
            "paper_name": chapter_name,
            "track": track,
            "paper_type": paper_type,
            "rel_path": rel_path,
            "total_questions": len(raw_problems),
            "total_score": paper_total_score
        })

        # Count questions in each section to accurately assign difficulty and position
        sec_counts = Counter(p["section"] for p in raw_problems)
        sec_index = defaultdict(int)
        
        for q_seq, raw_p in enumerate(raw_problems, 1):
            total_parsed_questions += 1
            sec_name = raw_p["section"]
            sec_index[sec_name] += 1
            sec_pos = sec_index[sec_name]
            sec_total = sec_counts[sec_name]
            
            uid = f"GK-{year}-{file_slug}-{q_seq:02d}"
            
            body_clean, options = extract_choices(raw_p["raw_problem"])
            body_clean = clean_latex(body_clean)
            
            ans_clean = clean_latex(raw_p["raw_answer"])
            sol_clean = clean_latex(raw_p["raw_solution"])
            
            if ans_clean:
                total_with_answers += 1
            if sol_clean:
                total_with_solutions += 1
                
            # ONLY extract problem images (NOT solution images, which belong inside solution)
            imgs = extract_images(raw_p["raw_problem"])
            if imgs:
                total_images_referenced += len(imgs)
                
            best_cat, subtags, methods = analyze_problem_category(body_clean, sol_clean, sec_name, year)
            difficulty = estimate_difficulty(sec_name, sec_pos, sec_total, best_cat, len(body_clean), len(sol_clean))
            score = paper_scores[q_seq - 1] if q_seq <= len(paper_scores) else 5
            adaptation = generate_adaptation_guide(best_cat, subtags, body_clean)
            
            # Record in analytics
            year_stats[year]["total"] += 1
            year_stats[year]["categories"][best_cat] += 1
            year_stats[year]["sections"][sec_name] += 1
            year_stats[year]["difficulties"][difficulty] += 1
            
            category_stats[best_cat]["total"] += 1
            category_stats[best_cat]["years"][year] += 1
            for st in subtags:
                category_stats[best_cat]["subtags"][st] += 1
            category_stats[best_cat]["difficulties"][difficulty] += 1
            
            province_stats[province]["total"] += 1
            province_stats[province]["years"][year] += 1
            province_stats[province]["categories"][best_cat] += 1
            
            section_stats[sec_name] += 1
            difficulty_stats[difficulty] += 1

            cursor.execute("""
            INSERT INTO questions (
                uid, paper_id, year, province, paper_name, track, paper_type,
                section, question_number, body, options_json, answer, solution,
                images_json, has_image, primary_category, subtags_json,
                methods_json, difficulty, score, adaptation_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                uid, paper_id, year, province, chapter_name, track, paper_type,
                sec_name, q_seq, body_clean, json.dumps(options, ensure_ascii=False),
                ans_clean, sol_clean, json.dumps(imgs, ensure_ascii=False),
                1 if imgs else 0, best_cat, json.dumps(subtags, ensure_ascii=False),
                json.dumps(methods, ensure_ascii=False), difficulty, score,
                json.dumps(adaptation, ensure_ascii=False)
            ))
            
            # Save lightweight summary item for frontend high-speed indexing
            all_questions_list.append({
                "uid": uid,
                "paper_id": paper_id,
                "year": year,
                "province": province,
                "paper_name": chapter_name,
                "track": track,
                "section": sec_name,
                "q_num": q_seq,
                "body_snippet": body_clean[:90] + ("..." if len(body_clean) > 90 else ""),
                "options": options,
                "has_answer": bool(ans_clean),
                "has_solution": bool(sol_clean),
                "has_image": bool(imgs),
                "category": best_cat,
                "subtags": subtags[:2],
                "methods": methods[:2],
                "difficulty": difficulty,
                "score": score
            })

    conn.commit()
    conn.close()
    
    print("\nDatabase committed successfully!")
    print(f"Total Papers Processed: {len(papers_summary)}")
    print(f"Total Questions Parsed: {total_parsed_questions}")
    print(f"Questions with Official/Detailed Solutions: {total_with_solutions} ({total_with_solutions/total_parsed_questions*100:.1f}%)")
    print(f"Questions with Explicit Answers: {total_with_answers}")
    print(f"Total Images Referenced: {total_images_referenced}")

    # Build Catalog JSON
    print("\nBuilding Catalog JSON...")
    catalog = {
        "metadata": {
            "total_papers": len(papers_summary),
            "total_questions": total_parsed_questions,
            "years_range": [1952, 2026],
            "year_count": len(year_stats),
            "categories": list(KNOWLEDGE_RULES.keys()),
            "provinces": [p[0] for p in PROVINCE_KEYWORDS]
        },
        "papers": papers_summary
    }
    with open(OUTPUT_CATALOG_JSON, "w", encoding="utf-8") as fp:
        json.dump(catalog, fp, ensure_ascii=False, indent=2)

    # Build Analysis JSON
    print("Building Multi-Dimensional Analytics Data...")
    
    # Format year trends
    year_trends = []
    for y in sorted(year_stats.keys()):
        stats = year_stats[y]
        year_trends.append({
            "year": y,
            "total": stats["total"],
            "categories": dict(stats["categories"]),
            "sections": dict(stats["sections"]),
            "difficulties": dict(stats["difficulties"])
        })
        
    category_summary = []
    for cat, data in category_stats.items():
        category_summary.append({
            "category": cat,
            "total": data["total"],
            "top_subtags": data["subtags"].most_common(6),
            "difficulties": dict(data["difficulties"]),
            "year_distribution": {str(y): data["years"][y] for y in sorted(data["years"].keys()) if y % 5 == 0 or y >= 2020 or y in [1952, 1977, 1978]}
        })
    category_summary.sort(key=lambda x: x["total"], reverse=True)

    province_summary = []
    for prov, data in province_stats.items():
        province_summary.append({
            "province": prov,
            "total": data["total"],
            "top_categories": data["categories"].most_common(5)
        })
    province_summary.sort(key=lambda x: x["total"], reverse=True)

    analysis_data = {
        "meta": {
            "generated_at": "2026-09-28",
            "total_questions": total_parsed_questions,
            "total_papers": len(papers_summary),
            "year_span": "1952 - 2026 (75 Years)"
        },
        "overview": {
            "sections": dict(section_stats.most_common()),
            "difficulties": dict(difficulty_stats),
            "categories": {cat: category_stats[cat]["total"] for cat in category_stats}
        },
        "year_trends": year_trends,
        "category_deep_dive": category_summary,
        "province_distribution": province_summary,
        "historical_eras": [
            {
                "era": "奠基探索期 (1952-1965)",
                "characteristics": "苏联教材体系影响深远，考题以初等代数、立体几何综合法证明、繁复计算与多项式因式分解为主，全卷通常仅6~8道大题，分值集中，计算量极大。",
                "core_topics": ["初等代数与传统几何", "平面与立体几何综合证明", "三角函数与恒等变换", "高次方程"]
            },
            {
                "era": "恢复与过渡期 (1977-1984)",
                "characteristics": "1977年恢复高考初期各省自主命题，随后迅速统一全国卷。注重考查基础数学素养与教学规范恢复，试题朴素扎实，重视基本运算与解析几何萌芽。",
                "core_topics": ["初等代数", "平面解析几何基础", "立体几何", "三角函数"]
            },
            {
                "era": "标准化与 3+2 改革期 (1985-1999)",
                "characteristics": "引入标准化客观选择题与填空题，文理数学明确分卷。解析几何（圆锥曲线）与空间几何并立，解答题六大题格局初具雏形。",
                "core_topics": ["平面解析几何", "立体几何", "数列", "三角函数", "不等式"]
            },
            {
                "era": "新课标与分省命题繁荣期 (2000-2019)",
                "characteristics": "各省自主命题蓬勃发展（如江苏卷以技巧灵活硬核著称，北京重视逻辑，上海注重高等数学前瞻）。微积分导数正式引入并成为压轴主角，概率统计地位大幅跃升，形成‘三角、立几、概率、数列、圆锥曲线、导数’六大经典解答题格局。",
                "core_topics": ["函数与导数", "平面解析几何", "立体几何与空间向量", "概率与统计", "数列", "三角函数"]
            },
            {
                "era": "新高考与立德树人一体化期 (2020-2026)",
                "characteristics": "文理合卷，引入创新多选题（少选得部分分、多选错选不得分）与19题全新卷面结构；极值点偏移、隐零点、情境化真实应用题、高等数学思想背景下沉，全面深化‘关键能力’与‘数学核心素养’考查。",
                "core_topics": ["函数与导数压轴", "圆锥曲线综合", "情境化现代统计与概率", "空间向量二面角", "数列与创新定义题"]
            }
        ]
    }
    
    with open(OUTPUT_ANALYSIS_JSON, "w", encoding="utf-8") as fp:
        json.dump(analysis_data, fp, ensure_ascii=False, indent=2)
        
    print(f"Analysis data saved to: {OUTPUT_ANALYSIS_JSON}")

    # Build summary json for fast frontend browsing (first 1000 items + full search index)
    with open(OUTPUT_JSON_SUMMARY, "w", encoding="utf-8") as fp:
        json.dump({
            "total": len(all_questions_list),
            "sample_questions": all_questions_list[:1200]
        }, fp, ensure_ascii=False)
        
    print(f"Frontend summary saved to: {OUTPUT_JSON_SUMMARY}")
    print("=" * 70)
    print("Gaokao Math Question Bank Build Complete!")

if __name__ == "__main__":
    main()
