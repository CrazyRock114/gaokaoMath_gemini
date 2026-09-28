#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Gaokao Math CLI Tool (1952-2026)
Command-line interface to search, inspect, compose, and export Gaokao math problems.
"""

import sys
import os
import argparse
import sqlite3
import json

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")

def get_db():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}. Please run scripts/build_question_bank.py first.")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def cmd_search(args):
    conn = get_db()
    c = conn.cursor()

    conditions = ["year >= ?", "year <= ?"]
    params = [args.year_min, args.year_max]

    if args.province:
        conditions.append("province = ?")
        params.append(args.province)
    if args.category:
        conditions.append("primary_category LIKE ?")
        params.append(f"%{args.category}%")
    if args.difficulty:
        conditions.append("difficulty = ?")
        params.append(args.difficulty)
    if args.section:
        conditions.append("section LIKE ?")
        params.append(f"%{args.section}%")
    if args.keyword:
        conditions.append("(body LIKE ? OR solution LIKE ?)")
        params.extend([f"%{args.keyword}%", f"%{args.keyword}%"])

    where = " WHERE " + " AND ".join(conditions)

    c.execute(f"SELECT COUNT(*) FROM questions {where}", params)
    total = c.fetchone()[0]

    c.execute(f"""
    SELECT uid, year, province, paper_name, section, question_number, body, answer, primary_category, difficulty, score
    FROM questions {where}
    ORDER BY year DESC, question_number ASC
    LIMIT ?
    """, params + [args.limit])
    rows = c.fetchall()
    conn.close()

    print(f"\nFound {total} questions matching criteria (showing top {len(rows)}):")
    print("-" * 75)
    for r in rows:
        snippet = r['body'][:65].replace('\n', ' ')
        print(f"[{r['uid']}] ({r['year']}·{r['province']}·{r['section']}·{r['difficulty']}) [{r['primary_category']}]")
        print(f"  题干: {snippet}...")
        if r['answer']:
            print(f"  答案: {r['answer']}")
        print("-" * 75)

def cmd_info(args):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM questions WHERE uid = ?", (args.uid,))
    r = c.fetchone()
    conn.close()

    if not r:
        print(f"Error: Question {args.uid} not found.")
        return

    print("=" * 75)
    print(f"试题编号: {r['uid']}")
    print(f"来源试卷: {r['paper_name']} ({r['year']}年 · {r['province']} · {r['track']})")
    print(f"题型题号: {r['section']} 第 {r['question_number']} 题 | 预估分值: {r['score']}分 | 难度: {r['difficulty']}")
    print(f"知识模块: {r['primary_category']}")
    print(f"二级标签: {', '.join(json.loads(r['subtags_json']))}")
    print(f"思想方法: {', '.join(json.loads(r['methods_json']))}")
    print("-" * 75)
    print("【题干】:")
    print(r['body'])
    opts = json.loads(r['options_json']) if r['options_json'] else []
    if opts:
        print("\n【选项】:")
        for idx, o in enumerate(opts):
            print(f"  {chr(65+idx)}. {o}")
    print("-" * 75)
    if r['answer']:
        print(f"【参考答案】: {r['answer']}\n")
    if r['solution']:
        print("【详细推导与解答】:")
        print(r['solution'])
    print("=" * 75)

def cmd_compose(args):
    conn = get_db()
    c = conn.cursor()

    print(f"\n正在智能组卷: 模式 = {args.preset}...")
    queries = [
        ("单选题", "基础", 4, None),
        ("单选题", "中档", 3, None),
        ("单选题", "压轴", 1, None),
        ("多选题", "中档", 2, None),
        ("多选题", "压轴", 1, None),
        ("填空题", "基础", 2, None),
        ("填空题", "压轴", 1, None),
        ("解答题", "中档", 1, "三角函数与解三角形"),
        ("解答题", "中档", 1, "立体几何与空间向量"),
        ("解答题", "中档", 1, "概率与统计"),
        ("解答题", "压轴", 1, "平面解析几何"),
        ("解答题", "压轴", 1, "函数与导数"),
    ]

    selected = []
    total_score = 0
    for sec, diff, count, cat in queries:
        q = ["year >= 2020", "section LIKE ?", "difficulty = ?"]
        p = [f"%{sec}%", diff]
        if cat:
            q.append("primary_category = ?")
            p.append(cat)
        c.execute(f"SELECT * FROM questions WHERE {' AND '.join(q)} ORDER BY RANDOM() LIMIT ?", p + [count])
        rows = c.fetchall()
        selected.extend(rows)

    conn.close()

    print(f"组卷成功！共选取 {len(selected)} 道试题。")
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(f"# 2026年高考数学全真模拟预测试卷\n\n")
            f.write(f"考试时间：120分钟  满分：150分\n\n---\n\n")
            for idx, r in enumerate(selected, 1):
                f.write(f"### 第 {idx} 题 ({r['score']}分 · {r['difficulty']} · 来源: {r['paper_name']})\n\n")
                f.write(f"{r['body']}\n\n")
                opts = json.loads(r['options_json']) if r['options_json'] else []
                if opts:
                    for oIdx, o in enumerate(opts):
                        f.write(f"- **{chr(65+oIdx)}.** {o}\n")
                    f.write("\n")
                if args.with_answers:
                    f.write(f"> **【答案】** {r['answer']}\n>\n> **【解析】** {r['solution']}\n\n")
                f.write("---\n\n")
        print(f"试卷已成功导出到: {args.output}")

def cmd_stats(args):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(DISTINCT paper_id), COUNT(*) FROM questions")
    papers, total = c.fetchone()
    c.execute("SELECT MIN(year), MAX(year) FROM questions")
    min_y, max_y = c.fetchone()
    print("=" * 60)
    print("  高考数学 1952-2026 年真题数据库概要")
    print("=" * 60)
    print(f"年份范围: {min_y} 年 ～ {max_y} 年 (跨度 75 年)")
    print(f"完整试卷: {papers} 套")
    print(f"真题总数: {total} 道")
    print("\n【知识域题量统计】:")
    for row in c.execute("SELECT primary_category, COUNT(*) FROM questions GROUP BY primary_category ORDER BY COUNT(*) DESC"):
        bar = "█" * int(row[1] / 150)
        print(f"  {row[0]:<15} : {row[1]:>5} 题  {bar}")
    print("=" * 60)
    conn.close()

def cmd_papers(args):
    conn = get_db()
    c = conn.cursor()
    conditions = []
    params = []
    if args.year:
        conditions.append("year = ?")
        params.append(args.year)
    if args.province:
        conditions.append("province LIKE ?")
        params.append(f"%{args.province}%")
    if args.keyword:
        conditions.append("paper_name LIKE ?")
        params.append(f"%{args.keyword}%")

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    c.execute(f"SELECT paper_id, year, province, paper_name, track, total_questions FROM papers {where} ORDER BY year DESC, province ASC LIMIT ?", params + [args.limit])
    rows = c.fetchall()
    conn.close()

    print(f"\n找到 {len(rows)} 套试卷 (显示前 {args.limit} 套):")
    print("-" * 75)
    for r in rows:
        print(f"[{r['paper_id']}] {r['paper_name']} ({r['year']}年 · {r['province']} · {r['track']}) - 共 {r['total_questions']} 题")
    print("-" * 75)
    print("使用 `python3 scripts/gaokao_cli.py paper <paper_id>` 查看整套试卷。")

def cmd_paper(args):
    conn = get_db()
    c = conn.cursor()
    paper_id = args.paper_id

    if not paper_id and args.year and args.province:
        c.execute("SELECT paper_id FROM papers WHERE year=? AND province LIKE ? LIMIT 1", (args.year, f"%{args.province}%"))
        row = c.fetchone()
        if row:
            paper_id = row[0]

    if not paper_id:
        print("Error: 请提供试卷编号 paper_id，或同时提供 --year 和 --province。例如: python3 scripts/gaokao_cli.py paper P-2026-national_paper_1")
        return

    c.execute("SELECT * FROM papers WHERE paper_id = ?", (paper_id,))
    p = c.fetchone()
    if not p:
        print(f"Error: 找不到试卷 {paper_id}")
        return

    c.execute("SELECT * FROM questions WHERE paper_id = ? ORDER BY question_number ASC", (paper_id,))
    questions = c.fetchall()
    conn.close()

    print("=" * 75)
    print(f"【试卷】: {p['paper_name']}")
    print(f"【年份与省份】: {p['year']}年 · {p['province']} · {p['track']} | 题量: {len(questions)} 题")
    print("=" * 75)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(f"# {p['paper_name']}\n\n年份: {p['year']}年  省份: {p['province']}  模式: {p['track']}\n\n---\n\n")
            for idx, q in enumerate(questions, 1):
                f.write(f"### 第 {idx} 题 ({q['score']}分 · {q['section']} · {q['difficulty']})\n\n")
                f.write(f"{q['body']}\n\n")
                opts = json.loads(q['options_json']) if q['options_json'] else []
                if opts:
                    for oIdx, o in enumerate(opts):
                        f.write(f"- **{chr(65+oIdx)}.** {o}\n")
                    f.write("\n")
                if args.with_answers:
                    f.write(f"> **【答案】** {q['answer']}\n>\n")
                    f.write(f"> **【详细解答】** {q['solution']}\n\n")
                f.write("---\n\n")
        print(f"整套试卷已成功导出到: {args.output}")
        return

    for idx, q in enumerate(questions, 1):
        print(f"\n【第 {idx} 题】 ({q['score']}分 · {q['section']} · 考查: {q['primary_category']})")
        print(q['body'])
        opts = json.loads(q['options_json']) if q['options_json'] else []
        if opts:
            print("选项:")
            for oIdx, o in enumerate(opts):
                print(f"  {chr(65+oIdx)}. {o}")
        if args.with_answers:
            if q['answer']:
                print(f"答案: {q['answer']}")
            if q['solution']:
                print(f"解析: {q['solution']}")
        print("-" * 50)

def main():
    parser = argparse.ArgumentParser(description="Gaokao Math Question Bank CLI (1952-2026)")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # papers list
    p_papers = subparsers.add_parser("papers", help="List exam papers by year/province")
    p_papers.add_argument("--year", type=int, default=0, help="Filter by year")
    p_papers.add_argument("--province", type=str, default="", help="Filter by province")
    p_papers.add_argument("--keyword", type=str, default="", help="Filter by keyword")
    p_papers.add_argument("--limit", type=int, default=20, help="Max results")

    # full paper view / export
    p_paper = subparsers.add_parser("paper", help="View or export a complete exam paper")
    p_paper.add_argument("paper_id", type=str, nargs="?", default="", help="Paper ID e.g. P-2026-national_paper_1")
    p_paper.add_argument("--year", type=int, default=0, help="Year of paper")
    p_paper.add_argument("--province", type=str, default="", help="Province of paper")
    p_paper.add_argument("--with-answers", action="store_true", help="Include solutions and answers")
    p_paper.add_argument("--output", type=str, default="", help="Export paper to markdown file")

    # search
    p_search = subparsers.add_parser("search", help="Search questions with filters")
    p_search.add_argument("--year-min", type=int, default=1952)
    p_search.add_argument("--year-max", type=int, default=2026)
    p_search.add_argument("--province", type=str, default="")
    p_search.add_argument("--category", type=str, default="")
    p_search.add_argument("--difficulty", type=str, default="")
    p_search.add_argument("--section", type=str, default="")
    p_search.add_argument("--keyword", type=str, default="")
    p_search.add_argument("--limit", type=int, default=10)

    # info
    p_info = subparsers.add_parser("info", help="Inspect a question by UID")
    p_info.add_argument("uid", type=str, help="Question UID, e.g. GK-2026-national_paper_1-01")

    # compose
    p_comp = subparsers.add_parser("compose", help="Smart compose an exam paper")
    p_comp.add_argument("--preset", type=str, default="new_gaokao_standard", choices=["new_gaokao_standard"])
    p_comp.add_argument("--output", type=str, default="generated_paper.md")
    p_comp.add_argument("--with-answers", action="store_true", help="Include full solutions in export")

    # stats
    subparsers.add_parser("stats", help="Show database overview statistics")

    args = parser.parse_args()
    if args.command == "papers":
        cmd_papers(args)
    elif args.command == "paper":
        cmd_paper(args)
    elif args.command == "search":
        cmd_search(args)
    elif args.command == "info":
        cmd_info(args)
    elif args.command == "compose":
        cmd_compose(args)
    elif args.command == "stats":
        cmd_stats(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
