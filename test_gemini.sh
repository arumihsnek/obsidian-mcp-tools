#!/bin/bash

cd packages/mcp-server

# Construir el servidor
bun run build

# Ejecutar servidor en segundo plano con la variable de entorno
OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb ./bin/mcp-server &
SERVER_PID=$!

# Esperar 5 segundos a que el servidor inicie
sleep 5

# Enviar solicitud de prueba
curl -X POST https://127.0.0.1:27124/call-tool -k -H "Content-Type: application/json" -d '{"name": "fetch", "arguments": {"url": "https://example.com", "raw": "true"}}'

# Detener servidor
kill $SERVER_PID
