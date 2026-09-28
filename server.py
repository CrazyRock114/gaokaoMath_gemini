#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
High-performance Gaokao Math Question Bank Server (1952-2026)
Provides RESTful APIs for question search, smart paper composition,
analytics queries, and serves the interactive Web platform and assets.
"""

import os
import sys
import json
import sqlite3
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import socket

WORKSPACE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(WORKSPACE, "question_bank", "gaokao_math.db")
WEB_DIR = os.path.join(WORKSPACE, "web_system")
PUBLIC_DIR = os.path.join(WORKSPACE, "public")
ANALYSIS_JSON = os.path.join(WORKSPACE, "analysis", "gaokao_analysis_data.json")
CATALOG_JSON = os.path.join(WORKSPACE, "question_bank", "catalog.json")
IMG_DIR = os.path.join(WORKSPACE, "latex_source", "img")
IMG_REPAINT_DIR = os.path.join(WORKSPACE, "latex_source", "img_repaint")

def get_db():
    """Connect to SQLite database in read-only mode for zero lock/journal issues."""
    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    except Exception:
        conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class GaokaoMathHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        # Resolve real path considering reverse proxy or Vercel serverless rewrites
        req_uri = self.headers.get("x-matched-path") or self.headers.get("x-forwarded-uri") or self.path
        parsed = urllib.parse.urlparse(req_uri)
        path = parsed.path
        
        # Merge query params from self.path and x-forwarded uri
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if not query and parsed.query:
            query = urllib.parse.parse_qs(parsed.query)

        # Handle Vercel rewrite mapping via __route__ query parameter
        if "__route__" in query:
            route_val = query.get("__route__", [""])[0]
            if route_val:
                path = "/api/" + route_val.lstrip("/")
        elif path in ["/api/index.py", "/api/index", "/api"]:
            route_val = query.get("route", [""])[0]
            if route_val:
                path = "/api/" + route_val.lstrip("/")

        # API: /api/stats
        if path == "/api/stats":
            self.handle_api_stats()
            return

        # API: /api/catalog
        if path == "/api/catalog":
            self.handle_api_catalog()
            return

        # API: /api/questions
        if path == "/api/questions":
            self.handle_api_questions(query)
            return

        # API: /api/papers
        if path == "/api/papers":
            self.handle_api_papers(query)
            return

        # API: /api/paper_detail
        if path == "/api/paper_detail":
            self.handle_api_paper_detail(query)
            return

        # API: /api/question
        if path == "/api/question":
            self.handle_api_single_question(query)
            return

        # Static assets: /img/...
        if path.startswith("/img/"):
            rel_img = path[5:]  # remove /img/
            local_path = os.path.join(IMG_DIR, rel_img)
            if os.path.exists(local_path):
                self.serve_file(local_path)
            else:
                # Redirect to jsDelivr CDN
                cdn_url = f"https://cdn.jsdelivr.net/gh/CrazyRock114/gaokaoMath_gemini@main/latex_source/img/{rel_img}"
                self.send_response(307)
                self.send_header("Location", cdn_url)
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self.end_headers()
            return

        # Static assets: /img_repaint/...
        if path.startswith("/img_repaint/"):
            rel_img = path[13:]  # remove /img_repaint/
            local_path = os.path.join(IMG_REPAINT_DIR, rel_img)
            if os.path.exists(local_path):
                self.serve_file(local_path)
            else:
                # Redirect to jsDelivr CDN
                cdn_url = f"https://cdn.jsdelivr.net/gh/CrazyRock114/gaokaoMath_gemini@main/latex_source/img_repaint/{rel_img}"
                self.send_response(307)
                self.send_header("Location", cdn_url)
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self.end_headers()
            return

        # Static Web System files
        if path == "/" or path == "/index.html":
            idx = os.path.join(PUBLIC_DIR, "index.html") if os.path.exists(os.path.join(PUBLIC_DIR, "index.html")) else os.path.join(WEB_DIR, "index.html")
            self.serve_file(idx, content_type="text/html; charset=utf-8")
            return
        
        if path in ["/app.js", "/style.css"]:
            fname = path[1:]
            local_path = os.path.join(PUBLIC_DIR, fname) if os.path.exists(os.path.join(PUBLIC_DIR, fname)) else os.path.join(WEB_DIR, fname)
            ctype = "application/javascript" if fname.endswith(".js") else "text/css"
            self.serve_file(local_path, content_type=ctype)
            return

        # Fallback to public or web_system directory
        for base in [PUBLIC_DIR, WEB_DIR]:
            target = os.path.join(base, path.lstrip("/"))
            if os.path.exists(target) and os.path.isfile(target):
                self.serve_file(target)
                return

        self.send_error(404, f"File not found: {path}")

    def do_POST(self):
        req_uri = self.headers.get("x-matched-path") or self.headers.get("x-forwarded-uri") or self.path
        parsed = urllib.parse.urlparse(req_uri)
        path = parsed.path
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if not query and parsed.query:
            query = urllib.parse.parse_qs(parsed.query)

        if "__route__" in query:
            route_val = query.get("__route__", [""])[0]
            if route_val:
                path = "/api/" + route_val.lstrip("/")
        elif path in ["/api/index.py", "/api/index", "/api"]:
            route_val = query.get("route", [""])[0]
            if route_val:
                path = "/api/" + route_val.lstrip("/")

        if path == "/api/compose":
            self.handle_api_compose()
            return
        self.send_error(404, "Not Found")

    def serve_file(self, file_path, content_type=None):
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, f"Resource not found: {file_path}")
            return
        
        try:
            with open(file_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            if content_type:
                self.send_header("Content-Type", content_type)
            else:
                if file_path.endswith(".png"):
                    self.send_header("Content-Type", "image/png")
                elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
                    self.send_header("Content-Type", "image/jpeg")
                elif file_path.endswith(".svg"):
                    self.send_header("Content-Type", "image/svg+xml")
                elif file_path.endswith(".json"):
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                elif file_path.endswith(".tex"):
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                else:
                    self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api_stats(self):
        try:
            if os.path.exists(ANALYSIS_JSON):
                with open(ANALYSIS_JSON, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.send_json(data)
            else:
                self.send_json({"error": "Analysis data not found"}, status=404)
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_catalog(self):
        try:
            if os.path.exists(CATALOG_JSON):
                with open(CATALOG_JSON, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.send_json(data)
            else:
                self.send_json({"error": "Catalog not found"}, status=404)
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_papers(self, query):
        try:
            year = query.get("year", [""])[0]
            province = query.get("province", [""])[0]
            track = query.get("track", [""])[0]
            keyword = query.get("keyword", [""])[0]

            conn = get_db()
            c = conn.cursor()

            conditions = []
            params = []

            if year and year != "全部" and year != "0":
                conditions.append("year = ?")
                params.append(int(year))
            if province and province != "全部":
                conditions.append("province = ?")
                params.append(province)
            if track and track != "全部":
                conditions.append("track = ?")
                params.append(track)
            if keyword:
                conditions.append("(paper_name LIKE ? OR file_path LIKE ?)")
                params.extend([f"%{keyword}%", f"%{keyword}%"])

            where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
            c.execute(f"""
            SELECT paper_id, year, province, paper_name, track, paper_type, file_path, total_questions, total_score
            FROM papers
            {where_clause}
            ORDER BY year DESC, province ASC, paper_name ASC
            """, params)

            rows = c.fetchall()
            papers = [dict(r) for r in rows]
            conn.close()

            self.send_json({"total": len(papers), "papers": papers})
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_paper_detail(self, query):
        try:
            paper_id = query.get("paper_id", [""])[0]
            if not paper_id:
                self.send_json({"error": "Missing paper_id"}, status=400)
                return

            conn = get_db()
            c = conn.cursor()

            c.execute("SELECT * FROM papers WHERE paper_id = ?", (paper_id,))
            p = c.fetchone()
            if not p:
                conn.close()
                self.send_json({"error": "Paper not found"}, status=404)
                return

            paper_meta = dict(p)

            c.execute("""
            SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                   section, question_number, body, options_json, answer, solution,
                   images_json, has_image, primary_category, subtags_json,
                   methods_json, difficulty, score, adaptation_json
            FROM questions
            WHERE paper_id = ?
            ORDER BY question_number ASC
            """, (paper_id,))

            rows = c.fetchall()
            conn.close()

            questions = []
            total_score = 0
            diff_counts = {"基础": 0, "中档": 0, "压轴": 0}

            for r in rows:
                score = r["score"] if r["score"] else 5
                total_score += score
                diff_counts[r["difficulty"]] = diff_counts.get(r["difficulty"], 0) + 1
                questions.append({
                    "uid": r["uid"],
                    "paper_id": r["paper_id"],
                    "year": r["year"],
                    "province": r["province"],
                    "paper_name": r["paper_name"],
                    "track": r["track"],
                    "paper_type": r["paper_type"],
                    "section": r["section"],
                    "question_number": r["question_number"],
                    "body": r["body"],
                    "options": json.loads(r["options_json"]) if r["options_json"] else [],
                    "answer": r["answer"],
                    "solution": r["solution"],
                    "images": json.loads(r["images_json"]) if r["images_json"] else [],
                    "has_image": bool(r["has_image"]),
                    "category": r["primary_category"],
                    "subtags": json.loads(r["subtags_json"]) if r["subtags_json"] else [],
                    "methods": json.loads(r["methods_json"]) if r["methods_json"] else [],
                    "difficulty": r["difficulty"],
                    "score": score,
                    "adaptation": json.loads(r["adaptation_json"]) if r["adaptation_json"] else {}
                })

            self.send_json({
                "paper": paper_meta,
                "total_questions": len(questions),
                "total_score": total_score,
                "difficulty_distribution": diff_counts,
                "questions": questions
            })
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_questions(self, query):
        try:
            year_min = int(query.get("year_min", [1952])[0])
            year_max = int(query.get("year_max", [2026])[0])
            province = query.get("province", [""])[0]
            track = query.get("track", [""])[0]
            section = query.get("section", [""])[0]
            category = query.get("category", [""])[0]
            difficulty = query.get("difficulty", [""])[0]
            has_image = query.get("has_image", [""])[0]
            keyword = query.get("keyword", [""])[0]
            paper_id = query.get("paper_id", [""])[0]
            limit = min(int(query.get("limit", [20])[0]), 100)
            offset = int(query.get("offset", [0])[0])

            conn = get_db()
            c = conn.cursor()

            conditions = ["year >= ?", "year <= ?"]
            params = [year_min, year_max]

            if province and province != "全部":
                conditions.append("province = ?")
                params.append(province)
            if track and track != "全部":
                conditions.append("track = ?")
                params.append(track)
            if section and section != "全部":
                conditions.append("section LIKE ?")
                params.append(f"%{section}%")
            if category and category != "全部":
                conditions.append("primary_category = ?")
                params.append(category)
            if difficulty and difficulty != "全部":
                conditions.append("difficulty = ?")
                params.append(difficulty)
            if has_image == "1":
                conditions.append("has_image = 1")
            if paper_id:
                conditions.append("paper_id = ?")
                params.append(paper_id)
            if keyword:
                conditions.append("(body LIKE ? OR answer LIKE ? OR solution LIKE ? OR subtags_json LIKE ? OR paper_name LIKE ?)")
                kw_pat = f"%{keyword}%"
                params.extend([kw_pat, kw_pat, kw_pat, kw_pat, kw_pat])

            where_clause = " WHERE " + " AND ".join(conditions)

            # Total count
            c.execute(f"SELECT COUNT(*) FROM questions {where_clause}", params)
            total_count = c.fetchone()[0]

            # Fetch rows
            c.execute(f"""
            SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                   section, question_number, body, options_json, answer, solution,
                   images_json, has_image, primary_category, subtags_json,
                   methods_json, difficulty, score, adaptation_json
            FROM questions
            {where_clause}
            ORDER BY year DESC, paper_id ASC, question_number ASC
            LIMIT ? OFFSET ?
            """, params + [limit, offset])

            rows = c.fetchall()
            results = []
            for r in rows:
                results.append({
                    "uid": r["uid"],
                    "paper_id": r["paper_id"],
                    "year": r["year"],
                    "province": r["province"],
                    "paper_name": r["paper_name"],
                    "track": r["track"],
                    "paper_type": r["paper_type"],
                    "section": r["section"],
                    "question_number": r["question_number"],
                    "body": r["body"],
                    "options": json.loads(r["options_json"]) if r["options_json"] else [],
                    "answer": r["answer"],
                    "solution": r["solution"],
                    "images": json.loads(r["images_json"]) if r["images_json"] else [],
                    "has_image": bool(r["has_image"]),
                    "category": r["primary_category"],
                    "subtags": json.loads(r["subtags_json"]) if r["subtags_json"] else [],
                    "methods": json.loads(r["methods_json"]) if r["methods_json"] else [],
                    "difficulty": r["difficulty"],
                    "score": r["score"],
                    "adaptation": json.loads(r["adaptation_json"]) if r["adaptation_json"] else {}
                })

            conn.close()

            self.send_json({
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "questions": results
            })

        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_single_question(self, query):
        try:
            uid = query.get("uid", [""])[0]
            if not uid:
                self.send_json({"error": "Missing uid"}, status=400)
                return

            conn = get_db()
            c = conn.cursor()

            c.execute("""
            SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                   section, question_number, body, options_json, answer, solution,
                   images_json, has_image, primary_category, subtags_json,
                   methods_json, difficulty, score, adaptation_json
            FROM questions WHERE uid = ?
            """, (uid,))
            r = c.fetchone()
            conn.close()

            if not r:
                self.send_json({"error": "Question not found"}, status=404)
                return

            data = {
                "uid": r["uid"],
                "paper_id": r["paper_id"],
                "year": r["year"],
                "province": r["province"],
                "paper_name": r["paper_name"],
                "track": r["track"],
                "paper_type": r["paper_type"],
                "section": r["section"],
                "question_number": r["question_number"],
                "body": r["body"],
                "options": json.loads(r["options_json"]) if r["options_json"] else [],
                "answer": r["answer"],
                "solution": r["solution"],
                "images": json.loads(r["images_json"]) if r["images_json"] else [],
                "has_image": bool(r["has_image"]),
                "category": r["primary_category"],
                "subtags": json.loads(r["subtags_json"]) if r["subtags_json"] else [],
                "methods": json.loads(r["methods_json"]) if r["methods_json"] else [],
                "difficulty": r["difficulty"],
                "score": r["score"],
                "adaptation": json.loads(r["adaptation_json"]) if r["adaptation_json"] else {}
            }
            self.send_json(data)
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def handle_api_compose(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))

            preset = params.get("preset", "new_gaokao_standard")
            target_year = params.get("year", 2026)

            conn = get_db()
            c = conn.cursor()

            selected_questions = []

            if preset == "full_paper":
                # Load exact existing paper
                paper_id = params.get("paper_id")
                if not paper_id:
                    # Pick 2026 national 1 as default
                    c.execute("SELECT paper_id FROM papers WHERE year=2026 AND paper_name LIKE '%全国I%' LIMIT 1")
                    row = c.fetchone()
                    paper_id = row[0] if row else "P-2026-national_paper_1"

                c.execute("""
                SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                       section, question_number, body, options_json, answer, solution,
                       images_json, has_image, primary_category, subtags_json,
                       methods_json, difficulty, score, adaptation_json
                FROM questions WHERE paper_id = ?
                ORDER BY question_number ASC
                """, (paper_id,))
                rows = c.fetchall()
            elif preset == "new_gaokao_standard":
                # 8 单选 + 3 多选 + 3 填空 + 5 解答 (Total 19 questions, 150 points)
                # Pick high quality modern questions from 2020-2026
                # 8 Single Choice: 4 basic, 3 medium, 1 hard
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
                rows = []
                for sec, diff, count, cat in queries:
                    q = ["year >= 2020", "section LIKE ?", "difficulty = ?"]
                    p = [f"%{sec}%", diff]
                    if cat:
                        q.append("primary_category = ?")
                        p.append(cat)
                    where = " WHERE " + " AND ".join(q)
                    c.execute(f"""
                    SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                           section, question_number, body, options_json, answer, solution,
                           images_json, has_image, primary_category, subtags_json,
                           methods_json, difficulty, score, adaptation_json
                    FROM questions {where}
                    ORDER BY RANDOM() LIMIT ?
                    """, p + [count])
                    rows.extend(c.fetchall())
            elif preset == "high_order_focus":
                # 6 Advanced Big Questions (Calculus, Conics, Solid Geometry, Sequences, Probability)
                focus_cats = ["函数与导数", "平面解析几何", "立体几何与空间向量", "数列", "概率与统计", "综合题"]
                rows = []
                for cat in focus_cats:
                    c.execute("""
                    SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                           section, question_number, body, options_json, answer, solution,
                           images_json, has_image, primary_category, subtags_json,
                           methods_json, difficulty, score, adaptation_json
                    FROM questions
                    WHERE year >= 2018 AND (section LIKE '%解答%' OR section LIKE '%综合%') AND primary_category = ?
                    ORDER BY RANDOM() LIMIT 1
                    """, (cat,))
                    r = c.fetchone()
                    if r:
                        rows.append(r)
            else:
                # Default 10 questions random
                c.execute("""
                SELECT uid, paper_id, year, province, paper_name, track, paper_type,
                       section, question_number, body, options_json, answer, solution,
                       images_json, has_image, primary_category, subtags_json,
                       methods_json, difficulty, score, adaptation_json
                FROM questions
                WHERE year >= 2020
                ORDER BY RANDOM() LIMIT 10
                """)
                rows = c.fetchall()

            conn.close()

            composed_questions = []
            total_score = 0
            diff_counts = {"基础": 0, "中档": 0, "压轴": 0}

            standard_scores = None
            if preset == "new_gaokao_standard" and len(rows) == 19:
                standard_scores = [5]*8 + [6]*3 + [5]*3 + [13, 15, 15, 17, 17]

            for idx, r in enumerate(rows, 1):
                if standard_scores and idx <= len(standard_scores):
                    score = standard_scores[idx - 1]
                else:
                    score = r["score"] if r["score"] else 5
                total_score += score
                diff_counts[r["difficulty"]] = diff_counts.get(r["difficulty"], 0) + 1
                composed_questions.append({
                    "exam_index": idx,
                    "uid": r["uid"],
                    "paper_id": r["paper_id"],
                    "year": r["year"],
                    "province": r["province"],
                    "paper_name": r["paper_name"],
                    "track": r["track"],
                    "section": r["section"],
                    "original_qnum": r["question_number"],
                    "body": r["body"],
                    "options": json.loads(r["options_json"]) if r["options_json"] else [],
                    "answer": r["answer"],
                    "solution": r["solution"],
                    "images": json.loads(r["images_json"]) if r["images_json"] else [],
                    "has_image": bool(r["has_image"]),
                    "category": r["primary_category"],
                    "subtags": json.loads(r["subtags_json"]) if r["subtags_json"] else [],
                    "methods": json.loads(r["methods_json"]) if r["methods_json"] else [],
                    "difficulty": r["difficulty"],
                    "score": score,
                    "adaptation": json.loads(r["adaptation_json"]) if r["adaptation_json"] else {}
                })

            response = {
                "paper_title": params.get("paper_title", "2026年高考数学全真模拟预测试卷"),
                "preset": preset,
                "total_questions": len(composed_questions),
                "total_score": total_score,
                "difficulty_distribution": diff_counts,
                "questions": composed_questions
            }
            self.send_json(response)

        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

def find_available_port(start_port=8080):
    port = start_port
    while port < 9000:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
            port += 1
    return 8080

def run_server(port=None):
    if port is None:
        port = find_available_port(8080)
    server_address = ('', port)
    httpd = HTTPServer(server_address, GaokaoMathHandler)
    print(f"==================================================================")
    print(f"  Gaokao Math Question Bank Server Started!")
    print(f"  URL: http://localhost:{port}")
    print(f"  Database: {DB_PATH}")
    print(f"  Web root: {WEB_DIR}")
    print(f"==================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run_server(p)
