#!/bin/bash

claude --dangerously-skip-permissions "prd: @docs/multi-team-support-implementation-plan.md plan: @plans/multi-team-support.md @progress.txt \
1. Read the PRD and progress file. \
2. Find the next incomplete phase in the plan and implement it. \
3. Commit your changes. \
4. Update progress.txt with what you did. update the phase in the plan with the new progress. \
ONLY DO ONE TASK AT A TIME."