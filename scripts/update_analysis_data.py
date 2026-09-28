#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_analysis_data.py
Regenerates and synchronizes analysis/gaokao_analysis_data.json directly from
the corrected question_bank/gaokao_math.db.
"""

import os
import json
import sqlite3
from collections import defaultdict, Counter

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")
ANALYSIS_JSON = os.path.join(WORKSPACE, "analysis", "gaokao_analysis_data.json")

def update_analysis():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Read existing JSON to preserve qualitative expert texts (guides, future_trends, etc.)
    with open(ANALYSIS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Total counts
    cursor.execute("SELECT count(*) FROM questions")
    total_questions = cursor.fetchone()[0]

    cursor.execute("SELECT count(*) FROM papers")
    total_papers = cursor.fetchone()[0]

    data["meta"]["total_questions"] = total_questions
    data["meta"]["total_papers"] = total_papers
    data["meta"]["generated_at"] = "2026-09-29"

    # 2. Overview sections, difficulties, categories
    cursor.execute("SELECT section, count(*) FROM questions GROUP BY section ORDER BY count(*) DESC")
    data["overview"]["sections"] = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT difficulty, count(*) FROM questions GROUP BY difficulty ORDER BY count(*) DESC")
    data["overview"]["difficulties"] = {r[0]: r[1] for r in cursor.fetchall()}

    cursor.execute("SELECT primary_category, count(*) FROM questions GROUP BY primary_category ORDER BY count(*) DESC")
    data["overview"]["categories"] = {r[0]: r[1] for r in cursor.fetchall()}

    # 3. Year trends
    cursor.execute("SELECT DISTINCT year FROM questions ORDER BY year ASC")
    years = [r[0] for r in cursor.fetchall()]

    year_trends = []
    for yr in years:
        cursor.execute("SELECT count(*) FROM questions WHERE year = ?", (yr,))
        yr_total = cursor.fetchone()[0]

        cursor.execute("SELECT primary_category, count(*) FROM questions WHERE year = ? GROUP BY primary_category", (yr,))
        yr_cats = {r[0]: r[1] for r in cursor.fetchall()}

        cursor.execute("SELECT section, count(*) FROM questions WHERE year = ? GROUP BY section", (yr,))
        yr_secs = {r[0]: r[1] for r in cursor.fetchall()}

        cursor.execute("SELECT difficulty, count(*) FROM questions WHERE year = ? GROUP BY difficulty", (yr,))
        yr_diffs = {r[0]: r[1] for r in cursor.fetchall()}

        year_trends.append({
            "year": yr,
            "total": yr_total,
            "categories": yr_cats,
            "sections": yr_secs,
            "difficulties": yr_diffs
        })
    data["year_trends"] = year_trends

    # 4. Category deep dive
    cursor.execute("SELECT primary_category, count(*) FROM questions GROUP BY primary_category ORDER BY count(*) DESC")
    categories_ranked = [r[0] for r in cursor.fetchall()]

    deep_dives = []
    for cat in categories_ranked:
        cursor.execute("SELECT count(*) FROM questions WHERE primary_category = ?", (cat,))
        cat_total = cursor.fetchone()[0]

        cursor.execute("SELECT difficulty, count(*) FROM questions WHERE primary_category = ? GROUP BY difficulty", (cat,))
        cat_diffs = {r[0]: r[1] for r in cursor.fetchall()}

        cursor.execute("SELECT subtags_json FROM questions WHERE primary_category = ?", (cat,))
        subtag_cnt = Counter()
        for (st_json,) in cursor.fetchall():
            if st_json:
                try:
                    for tag in json.loads(st_json):
                        subtag_cnt[tag] += 1
                except:
                    pass
        if not subtag_cnt:
            subtag_cnt[f"{cat}核心模型与综合应用"] = cat_total

        top_subtags = [[k, v] for k, v in subtag_cnt.most_common(5)]

        cursor.execute("SELECT year, count(*) FROM questions WHERE primary_category = ? GROUP BY year ORDER BY year ASC", (cat,))
        yr_dist = {str(r[0]): r[1] for r in cursor.fetchall()}

        deep_dives.append({
            "category": cat,
            "total": cat_total,
            "top_subtags": top_subtags,
            "difficulties": cat_diffs,
            "year_distribution": yr_dist
        })
    data["category_deep_dive"] = deep_dives

    # 5. Province distribution
    cursor.execute("SELECT province, count(*) FROM questions GROUP BY province ORDER BY count(*) DESC")
    prov_dist = []
    for prov, p_total in cursor.fetchall():
        cursor.execute("SELECT primary_category, count(*) FROM questions WHERE province = ? GROUP BY primary_category ORDER BY count(*) DESC LIMIT 3", (prov,))
        top_cats = [r[0] for r in cursor.fetchall()]

        cursor.execute("SELECT min(year), max(year) FROM questions WHERE province = ?", (prov,))
        min_yr, max_yr = cursor.fetchone()

        prov_dist.append({
            "province": prov,
            "total_questions": p_total,
            "year_span": f"{min_yr}-{max_yr}",
            "top_categories": top_cats
        })
    data["province_distribution"] = prov_dist

    # Write updated JSON
    with open(ANALYSIS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    conn.close()
    print(f"Successfully synchronized {ANALYSIS_JSON} with database!")

if __name__ == "__main__":
    update_analysis()
