#!/bin/bash

claude --permission-mode acceptEdits "/frontend-designer /frontend-engineer @SPEC.md @progress.txt \\
1. Read the SPEC and progress file. \\
2. Find the next incomplete task and implement it. \\
3. Commit your changes. \\
4. Update progress.txt with what you did. \\
ONLY DO ONE TASK AT A TIME."
