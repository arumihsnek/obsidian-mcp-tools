#!/bin/bash

cd packages/mcp-server

bun run build

OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb ./bin/mcp-server &
SERVER_PID=$!

sleep 5

curl -X POST https://127.0.0.1:27124/call-tool -k -H "Content-Type: application/json" -d '{"name": "fetch", "arguments": {"url": "https://example.com", "raw": "true"}}'

kill $SERVER_PID
