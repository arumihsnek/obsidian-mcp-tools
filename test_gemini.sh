#!/bin/bash

# Construir el servidor
cd packages/mcp-server
mkdir -p ../../bin
bun run build
chmod +x ../../bin/mcp-server

# Ejecutar servidor en segundo plano con la variable de entorno
cd ../..
OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb ./bin/mcp-server &
SERVER_PID=$!

# Esperar 10 segundos a que el servidor inicie
sleep 10

# Enviar solicitud de prueba con cabecera de autorización
curl -X POST https://127.0.0.1:27124/mcp-tool -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb" \
  -d '{"name": "fetch", "arguments": {"url": "https://example.com", "raw": "true"}}'

# Detener servidor de forma segura
if kill -0 $SERVER_PID 2>/dev/null; then
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null
fi
