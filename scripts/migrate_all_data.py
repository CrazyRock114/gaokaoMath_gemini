#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migration Script for Gaokao Math Database:
1. P0-1: Normalize LaTeX custom macros (\bs, \e, \i, \myarc, \frac1\i, fill-in blanks ______)
2. P0-2: Fix case-sensitivity of image paths (30 image files across 20 questions)
3. P1-4: Rectify cross-module misclassified questions (e.g. GK-1993-national_science-18 to 3D geometry)
4. Backup existing SQLite database before migration
"""

import os
import shutil
import sqlite3
import json
import re
from datetime import datetime

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")
IMG_DIR = os.path.join(WORKSPACE, "latex_source", "img")

def backup_db():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{DB_PATH}.bak_{timestamp}"
    shutil.copy2(DB_PATH, backup_path)
    print(f"[Backup] Database backed up to {backup_path}")
    return backup_path

def build_image_case_map():
    real_files = {}
    for root, dirs, files in os.walk(IMG_DIR):
        for f in files:
            full_path = os.path.join(root, f)
            rel = os.path.relpath(full_path, os.path.join(WORKSPACE, "latex_source"))
            real_files[rel.lower()] = rel
    return real_files

RE_MATH = re.compile(r'(\\\([\s\S]*?\\\))|(\$\$[\s\S]*?\$\$)|(\\\[[\s\S]*?\\\])')

def clean_math_segment(seg):
    delim_start = ""
    delim_end = ""
    content = ""
    if seg.startswith(r"\(") and seg.endswith(r"\)"):
        delim_start, delim_end = r"\(", r"\)"
        content = seg[2:-2]
    elif seg.startswith("$$") and seg.endswith("$$"):
        delim_start, delim_end = "$$", "$$"
        content = seg[2:-2]
    elif seg.startswith(r"\[") and seg.endswith(r"\]"):
        delim_start, delim_end = r"\[", r"\]"
        content = seg[2:-2]
    else:
        return seg

    # 1. Fill-in blank: replace 2 or more underscores with standard KaTeX underline
    content = re.sub(r'_{2,}', r'\\underline{\\hspace{2.5em}}', content)

    # 2. \bs macro: \bs u or \bs{u} -> \boldsymbol{u}
    content = re.sub(r'\\bs\s*([a-zA-Z0-9]+)', r'\\boldsymbol{\1}', content)
    content = re.sub(r'\\bs\{([^}]+)\}', r'\\boldsymbol{\1}', content)

    # 3. \myarc macro: \myarc{AB} -> \overset{\frown}{AB}
    content = re.sub(r'\\myarc\{([^}]+)\}', r'\\overset{\\frown}{\1}', content)

    # 4. \frac1\i or \frac1\mathrm{i} fix
    content = re.sub(r'\\frac1\\mathrm\{i\}', r'\\frac{1}{\\mathrm{i}}', content)
    content = re.sub(r'\\frac1\\i(?![a-zA-Z])', r'\\frac{1}{\\mathrm{i}}', content)

    # 5. \i and \e macros in math mode
    content = re.sub(r'\\i(?![a-zA-Z])', r'\\mathrm{i}', content)
    content = re.sub(r'\\e(?![a-zA-Z])', r'\\mathrm{e}', content)

    return f"{delim_start}{content}{delim_end}"

def normalize_text_latex(text, image_case_map):
    if not text:
        return text

    # Remove math delimiters wrapping HTML divs or tables
    text = re.sub(r'\\\(\s*(<div[\s\S]*?<\/div>)\s*\\\)', r'\1', text)
    text = re.sub(r'\\\[\s*(<div[\s\S]*?<\/div>)\s*\\\]', r'\1', text)

    # Normalize image paths
    for low_p, canonical_p in image_case_map.items():
        if low_p != canonical_p:
            text = text.replace(f"/{low_p}", f"/{canonical_p}")
            text = text.replace(low_p, canonical_p)

    # Normalize math segments
    def repl_math(match):
        return clean_math_segment(match.group(0))

    text = RE_MATH.sub(repl_math, text)
    return text

def migrate_database():
    backup_db()
    image_case_map = build_image_case_map()
    print(f"[Image Map] Indexed {len(image_case_map)} image files from disk.")

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("SELECT uid, body, options_json, answer, solution, images_json, primary_category, subtags_json FROM questions")
    rows = c.fetchall()
    print(f"[Process] Scanning and updating {len(rows)} questions...")

    updated_count = 0
    image_fix_count = 0
    cat_fix_count = 0

    geom_kws = ['异面直线', '二面角', '三棱锥', '四棱锥', '四面体', '长方体', '正方体', '直三棱柱', '斜三棱柱', '侧棱', '空间四边形', '空间直角坐标系', '多面体', '球的表面积', '球的体积', '底面', '侧面积', '线面角', '面面垂直', '线面垂直']
    conic_kws = ['双曲线', '抛物线', '椭圆', '离心率', '渐近线', '准线方程']

    update_payloads = []

    for uid, body, opt_json, answer, solution, img_json, prim_cat, subtags in rows:
        needs_update = False

        # 1. LaTeX Normalization
        new_body = normalize_text_latex(body, image_case_map)
        new_answer = normalize_text_latex(answer, image_case_map)
        new_solution = normalize_text_latex(solution, image_case_map)

        new_opt_json = opt_json
        if opt_json:
            try:
                opts = json.loads(opt_json)
                new_opts = [normalize_text_latex(opt, image_case_map) for opt in opts]
                new_opt_json = json.dumps(new_opts, ensure_ascii=False)
            except Exception:
                pass

        if new_body != body or new_answer != answer or new_solution != solution or new_opt_json != opt_json:
            needs_update = True

        # 2. Images JSON case normalization
        new_img_json = img_json
        if img_json and img_json != "[]":
            try:
                imgs = json.loads(img_json)
                changed_img = False
                for img in imgs:
                    p = img.get("path", "").lstrip("/")
                    real = image_case_map.get(p.lower())
                    if real and real != p:
                        img["path"] = real
                        changed_img = True
                if changed_img:
                    new_img_json = json.dumps(imgs, ensure_ascii=False)
                    needs_update = True
                    image_fix_count += 1
            except Exception:
                pass

        # 3. Knowledge Point Classification Correction (P1-4)
        new_cat = prim_cat
        new_subtags = subtags

        if uid == 'GK-1993-national_science-18':
            new_cat = '立体几何与空间向量'
            new_subtags = json.dumps(['异面直线所成角', '空间角计算'], ensure_ascii=False)
            needs_update = True
            cat_fix_count += 1
        elif prim_cat == '三角函数与解三角形':
            # Check if this is a single problem (not multi-question) with clear 3D geometry or conic content
            is_multi = body.startswith('(1)') and '(2)' in body
            if not is_multi:
                if any(kw in body for kw in geom_kws):
                    new_cat = '立体几何与空间向量'
                    new_subtags = json.dumps(['立体几何综合应用'], ensure_ascii=False)
                    needs_update = True
                    cat_fix_count += 1
                elif any(kw in body for kw in conic_kws):
                    new_cat = '平面解析几何'
                    new_subtags = json.dumps(['圆锥曲线综合应用'], ensure_ascii=False)
                    needs_update = True
                    cat_fix_count += 1

        if needs_update:
            updated_count += 1
            update_payloads.append((
                new_body,
                new_opt_json,
                new_answer,
                new_solution,
                new_img_json,
                new_cat,
                new_subtags,
                uid
            ))

    print(f"[Database Update] Writing {len(update_payloads)} modified rows...")
    c.executemany("""
        UPDATE questions
        SET body = ?, options_json = ?, answer = ?, solution = ?, images_json = ?, primary_category = ?, subtags_json = ?
        WHERE uid = ?
    """, update_payloads)
    conn.commit()
    conn.close()

    print(f"[Done] Total questions updated: {updated_count}")
    print(f"       Images_json fixed: {image_fix_count}")
    print(f"       Categories rectified: {cat_fix_count}")

if __name__ == "__main__":
    migrate_database()
