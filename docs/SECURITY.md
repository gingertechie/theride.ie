# Security Guidelines

## Secrets Management

### DO:
- Store all secrets in Cloudflare environment variables
- Use `wrangler secret put` for Worker secrets
- Reference secrets via `env.SECRET_NAME` in code

### DON'T:
- Commit API keys, passwords, or tokens
- Store secrets in `.claude/settings.local.json`
- Hardcode credentials in source files

## Incident Response

### API Key Rotation Checklist:
1. Generate new key at provider
2. Update Cloudflare secrets immediately
3. Verify worker runs successfully
4. Revoke old key at provider
5. Document in git commit

## Rate Limiting

### Cloudflare Dashboard Configuration

The Ride uses Cloudflare's built-in rate limiting to prevent abuse:

#### Read Endpoints (GET)
- **Rule:** 100 requests per minute per IP
- **Scope:** `/api/*`
- **Action:** Return 429 Too Many Requests
- **Duration:** 1 minute block

#### Write Endpoints (PUT/DELETE/POST)
- **Rule:** 10 requests per minute per IP
- **Scope:** `/api/sensors/*` (write methods only)
- **Action:** Return 429 Too Many Requests
- **Duration:** 5 minute block

### Configuration Steps

1. Log into Cloudflare dashboard
2. Navigate to: Security > WAF > Rate limiting rules
3. Create rule: "API Read Rate Limit"
   - If: `http.request.uri.path matches "^/api/"` AND `http.request.method eq "GET"`
   - Then: Rate limit 100 req/min per IP
4. Create rule: "API Write Rate Limit"
   - If: `http.request.uri.path matches "^/api/sensors/"` AND `http.request.method in {"PUT","DELETE","POST"}`
   - Then: Rate limit 10 req/min per IP

### Testing Rate Limits

```bash
# Test read rate limit (should block after 100 requests)
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://theride.ie/api/stats/national.json"
  sleep 0.1
done

# Test write rate limit (should block after 10 requests)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X DELETE \
    -H "Authorization: Bearer $ADMIN_API_KEY" \
    "https://theride.ie/api/sensors/test-$i.json"
  sleep 0.1
done
```
