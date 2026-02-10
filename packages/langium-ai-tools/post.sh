#!/bin/bash
curl -X POST http://localhost:8080/evaluate \
-H "Content-Type: application/json" \
-d '{
  "evaluator": "myeval",
  "program": "grammar Test\nentry Model: value?='ok';"
}'
