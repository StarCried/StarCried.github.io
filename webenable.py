import http.server

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler
httpd = http.server.HTTPServer(("", PORT), Handler)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    httpd.socket.close()