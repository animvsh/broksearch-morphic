#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request


BASE_URL = os.environ.get("BROK_BASE_URL", "https://www.brok.fyi").rstrip("/")
API_KEY = os.environ.get("BROK_API_KEY")

if not API_KEY:
    print("missing BROK_API_KEY", file=sys.stderr)
    print('example: export BROK_API_KEY="brok_sk_your_key"', file=sys.stderr)
    sys.exit(1)


def brok_request(path, method="GET", payload=None):
    data = None
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "brok-api-python-example/1.0",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
            body = json.loads(text) if text else None
            request_id = response.headers.get("x-request-id") or response.headers.get(
                "x-brok-request-id"
            )
            return {"body": body, "request_id": request_id, "status": response.status}
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8")
        try:
            body = json.loads(text)
            message = body.get("error", {}).get("message") or error.reason
        except json.JSONDecodeError:
            message = text or error.reason
        raise RuntimeError(f"{path} failed with {error.code}: {message}") from error


def preview(value, max_length=280):
    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, indent=2)
    return text[:max_length] + "..." if len(text) > max_length else text


print(f"Brok API base URL: {BASE_URL}")

models = brok_request("/api/v1/models")
model_ids = [model["id"] for model in models["body"].get("data", [])]
print(f"models ({len(model_ids)}): {', '.join(model_ids)}")

chat = brok_request(
    "/api/v1/chat/completions",
    method="POST",
    payload={
        "model": "brok-code",
        "messages": [
            {
                "role": "user",
                "content": "Write a compact release checklist for an API client.",
            }
        ],
        "temperature": 0.2,
        "max_tokens": 500,
        "stream": False,
    },
)
chat_content = (
    chat["body"].get("choices", [{}])[0].get("message", {}).get("content")
    or chat["body"]
)
print(f"chat request id: {chat['request_id'] or 'not returned'}")
print(f"chat preview: {preview(chat_content)}")

search = brok_request(
    "/api/v1/search/completions",
    method="POST",
    payload={
        "model": "brok-search",
        "query": "What should I verify before shipping a public API integration?",
        "search_depth": "standard",
        "stream": False,
    },
)
search_content = (
    search["body"].get("choices", [{}])[0].get("message", {}).get("content")
    or search["body"]
)
print(f"search request id: {search['request_id'] or 'not returned'}")
print(f"search preview: {preview(search_content)}")
print(f"search citations: {len(search['body'].get('citations', []))}")
