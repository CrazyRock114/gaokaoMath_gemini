#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Vercel Serverless Function Handler for Gaokao Math Question Bank
Routes all /api/* requests to the GaokaoMathHandler.
"""

import os
import sys

# Ensure root workspace directory is in Python module path
WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE not in sys.path:
    sys.path.insert(0, WORKSPACE)

from server import GaokaoMathHandler

class handler(GaokaoMathHandler):
    """
    Vercel Serverless Function entry point.
    Inherits all API routing, SQLite querying, and JSON formatting from GaokaoMathHandler.
    """
    pass
