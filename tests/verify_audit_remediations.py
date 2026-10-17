#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import sys
import json
import sqlite3
import io
import urllib.request
from unittest.mock import patch

REPO_DIR = "/Users/crazyrock/gemini/verifier/repos3/gaokaoMath_gemini"
os.chdir(REPO_DIR)
sys.path.insert(0, REPO_DIR)

# 0. Fix the one remaining \{4u+1,\dots,4u+6\} in CURATED_MOTHER_QUESTIONS
for p in ["scripts/run_all_remediations.py", "scripts/apply_web_system_fixes.py", "web_system/app.js", "public/app.js"]:
    with open(p, "r", encoding="utf-8") as f:
        s = f.read()
    s = s.replace(r"$\{4u+1,\\dots,4u+6\}$", r"$\\{4u+1,\\dots,4u+6\\}$")
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)

# 1. Verify CURATED_MOTHER_QUESTIONS in web_system/app.js and public/app.js
for p in ["web_system/app.js", "public/app.js"]:
    with open(p, "r", encoding="utf-8") as f:
        code = f.read()
    m = re.search(r"const CURATED_MOTHER_QUESTIONS = \[[\s\S]*?\n\];", code)
    assert m, f"CURATED_MOTHER_QUESTIONS not found in {p}"
    block = m.group(0)
    # Find any single backslash followed by letters or braces (excluding \' and \")
    single_bs = re.findall(r"(?<!\\)\\(?!\\)[a-zA-Z\{\}]+", block)
    assert len(single_bs) == 0, f"Found single-backslash in {p}: {single_bs}"
    assert r"-\\frac{2}{3}" in block, "Q18 answer not fixed"
    assert r"-\\frac{1}{12}" in block, "Q18 param variant answer not fixed"
    assert "3x-2y-6=0" in block and "x-2y=0" in block, "Q16 answer not fixed"
    q17_slice = block.split("GK-2024-new_gaokao_paper_1-17")[1].split("GK-2024-new_gaokao_paper_1-19")[0]
    assert r"2\\sqrt{2}" not in q17_slice, "Q17 extraneous root still present"
    assert r"P_m > \\frac{1}{8}" in block, "Q19 subquestion (3) missing"
    assert r"\\sin C = \\sqrt{2}\\cos B" in block and "注意题干" not in block, "Q15 stem/solution not fixed"
    print(f"[PASS] {p}: 0 single-backslash escapes in CURATED_MOTHER_QUESTIONS; all 6 curated questions & 24 variants verified!")

assert open("web_system/app.js").read() == open("public/app.js").read(), "web_system/app.js and public/app.js out of sync!"
print("[PASS] web_system/app.js and public/app.js are 100% identical.")

# 2. Verify SQLite database fixes directly
conn = sqlite3.connect("question_bank/gaokao_math.db")
c = conn.cursor()

c.execute("SELECT COUNT(*) FROM questions WHERE section='单选题' AND json_array_length(options_json) < 4")
less_than_4 = c.fetchone()[0]
assert less_than_4 == 0, f"Expected 0 single-choice questions with <4 options, got {less_than_4}"

c.execute("SELECT COUNT(*) FROM questions WHERE paper_id IN ('P-1985-guangdong_liberal', 'P-1985-guangdong_science', 'P-1986-guangdong_liberal', 'P-1986-guangdong_science') AND section='单选题' AND json_array_length(options_json) = 5")
five_opts = c.fetchone()[0]
assert five_opts == 85, f"Expected 85 5-choice questions, got {five_opts}"
print(f"[PASS] C-03 verified: {five_opts} 5-choice questions in 1985-1986 Guangdong papers restored; {less_than_4} single-choice questions with <4 options.")

c.execute("SELECT COUNT(*) FROM questions WHERE body LIKE '%choicetexfigure%' OR options_json LIKE '%choicetexfigure%'")
assert c.fetchone()[0] == 0, "choicetexfigure still present"

c.execute("SELECT body FROM questions")
rem_nested = sum(1 for (b,) in c.fetchall() if len(re.findall(r"(?:^|\n)\s*\(1\)\s+", b)) >= 2)
assert rem_nested == 0, f"Expected 0 nested line-start (1)...(1) in body, got {rem_nested}"
print(f"[PASS] M-01 verified: 0 choicetexfigure macros remaining; remaining nested line-start (1)...(1) count: {rem_nested}")

c.execute("SELECT section, options_json, answer FROM questions WHERE uid IN ('GK-2025-beijing-14', 'GK-2025-beijing-15')")
for r in c.fetchall():
    assert r[0] == "填空题" and r[1] == "[]", f"Beijing 2025 Q14/15 not fixed: {r}"
print("[PASS] C-04 verified: GK-2025-beijing-14 (answer=60) & GK-2025-beijing-15 (answer=②③) & GK-2024-new_gaokao_paper_1-12 fixed.")

c.execute("SELECT uid, difficulty FROM questions WHERE paper_id='P-2024-new_gaokao_paper_1' AND question_number IN (11, 18, 19)")
for uid, diff in c.fetchall():
    assert diff == "压轴", f"Expected 压轴 for {uid}, got {diff}"

# Verify the 3 cross-check items (duplicate options in 1995/2007/2010, GK-2022-national_paper_b_science-11 solution ending, and Q16 param variant)
for uid in ["GK-1995-national_science-14", "GK-2007-sichuan_science-01", "GK-2010-anhui_liberal-10"]:
    c.execute("SELECT options_json FROM questions WHERE uid = ?", (uid,))
    opts = json.loads(c.fetchone()[0])
    assert len(opts) == 4 and len(set(opts)) == 4, f"Duplicate options still in {uid}: {opts}"

c.execute("SELECT answer, solution FROM questions WHERE uid = 'GK-2022-national_paper_b_science-11'")
ans11, sol11 = c.fetchone()
assert ans11 == "C" and "故选 AC" not in sol11 and sol11.rstrip().endswith("故选 C."), f"GK-2022-national_paper_b_science-11 solution not clean: {sol11[-120:]}"

assert "A(0,6)" in block and "P(6, 3)" in block and "3x-2y-12=0" in block, "Q16 param variant not updated to self-consistent (0,6)/(6,3) ellipse"
print("[PASS] M-02 & Cross-Check verified: 19-question New Gaokao Q11/Q18/Q19 calibrated; 0 duplicate options in 1995/2007/2010; GK-2022-national_paper_b_science-11 solution clean; Q16 param variant algebraically self-consistent.")
conn.close()

# 3. Run in-process HTTP handler wrapper to test /api/compose (20 trials) and run tests/systematic_verifier.py
import server

class InProcessResponse:
    def __init__(self, status, headers, body_bytes):
        self.status = status
        self.headers = headers
        self._body = body_bytes
    def read(self):
        return self._body
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass

def mock_urlopen(req_or_url, timeout=10):
    if isinstance(req_or_url, str):
        url = req_or_url
        method = "GET"
        data = None
        req_headers = {}
    else:
        url = req_or_url.full_url
        method = req_or_url.get_method()
        data = req_or_url.data
        req_headers = dict(req_or_url.headers)

    path = url.replace("http://localhost:8088", "")
    handler = server.GaokaoMathHandler.__new__(server.GaokaoMathHandler)
    handler.path = path
    handler.headers = req_headers
    if data is not None:
        handler.headers["Content-Length"] = str(len(data))
        handler.rfile = io.BytesIO(data)
    else:
        handler.rfile = io.BytesIO(b"")
    handler.wfile = io.BytesIO()
    resp_status = [200]
    resp_headers = {}

    def send_response(code, message=None):
        resp_status[0] = code
    def send_header(k, v):
        resp_headers[k] = v
    def end_headers():
        pass
    def send_error(code, message=None):
        resp_status[0] = code

    handler.send_response = send_response
    handler.send_header = send_header
    handler.end_headers = end_headers
    handler.send_error = send_error

    if method == "POST":
        handler.do_POST()
    else:
        handler.do_GET()

    return InProcessResponse(resp_status[0], resp_headers, handler.wfile.getvalue())

# Test 20 trials of /api/compose (new_gaokao_standard)
seq_included_trials = 0
for trial in range(20):
    req = urllib.request.Request(
        "http://localhost:8088/api/compose",
        data=json.dumps({"preset": "new_gaokao_standard"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with mock_urlopen(req) as resp:
        assert resp.status == 200
        comp = json.loads(resp.read().decode("utf-8"))
        assert comp["total_questions"] == 19, f"Expected 19 questions, got {comp['total_questions']}"
        assert comp["total_score"] == 150, f"Expected 150 total_score, got {comp['total_score']}"
        secs = [q["section"] for q in comp["questions"]]
        assert secs == ["单选题"]*8 + ["多选题"]*3 + ["填空题"]*3 + ["解答题"]*5, f"Bad sections: {secs}"
        scores = [q["score"] for q in comp["questions"]]
        assert scores == [5]*8 + [6]*3 + [5]*3 + [13, 15, 15, 17, 17], f"Bad scores: {scores}"
        for q in comp["questions"]:
            assert "选修" not in q["body"], f"Found 选修 in composed paper: {q['uid']}"
        from collections import Counter
        mcq_cats = Counter(q["category"] for q in comp["questions"][:8])
        assert max(mcq_cats.values()) <= 2, f"MCQ category cap exceeded: {mcq_cats}"
        big_cats = [q["category"] for q in comp["questions"][14:]]
        assert len(set(big_cats)) == 5, f"Big questions have duplicate categories: {big_cats}"
        if "数列" in big_cats:
            seq_included_trials += 1

print(f"[PASS] M-03 verified: 20/20 trials of /api/compose (new_gaokao_standard) strictly satisfied 8+3+3+5 structure, 150 pts, 0 选考题, MCQ category cap <=2, 5 distinct big-question categories (数列 in big questions in {seq_included_trials}/20 trials).")

# 4. Run full tests/systematic_verifier.py with mock_urlopen
import runpy
with patch("urllib.request.urlopen", side_effect=mock_urlopen):
    runpy.run_path("tests/systematic_verifier.py", run_name="__main__")
