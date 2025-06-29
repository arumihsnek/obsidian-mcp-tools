#!/bin/bash

# Construir el servidor
echo "Construyendo servidor..."
cd packages/mcp-server
mkdir -p ../../bin
bun run build

if [ $? -ne 0 ]; then
    echo "Error en el build"
    exit 1
fi

chmod +x ../../bin/mcp-server
cd ../..

echo "Probando servidor MCP..."

# Test 1: Inicialización correcta del servidor MCP
echo "=== Test 1: Inicializando servidor ==="
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}' | \
OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb \
./bin/mcp-server

echo -e "\n"

# Test 2: Listar herramientas disponibles (después de inicializar)
echo "=== Test 2: Listando herramientas disponibles ==="
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | \
OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb \
./bin/mcp-server

echo -e "\n"

# Test 3: Llamar a herramienta con argumentos correctos
echo "=== Test 3: Llamando herramienta fetch ==="
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "fetch", "arguments": {"url": "https://httpbin.org/json"}}}' | \
OBSIDIAN_API_KEY=db86fc1d2eaf4f45fd937f31b55698599e42797e6716a144f41a8a69a232d8cb \
./bin/mcp-server

echo -e "\nPruebas completadas"