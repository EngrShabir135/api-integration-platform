from __future__ import annotations

import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st


ROOT = Path(__file__).parent
INTEGRATIONS_PATH = ROOT / "src" / "config" / "integrations.json"
API_KEYS_PATH = ROOT / "src" / "config" / "apiKeys.json"


MOCK_RESPONSES: dict[str, list[dict[str, Any]]] = {
    "crm-users": [
        {
            "user_id": 1,
            "full_name": "Ava Thompson",
            "email_address": "ava@example.com",
            "signup_ts": "2024-01-15T10:00:00Z",
        },
        {
            "user_id": 2,
            "full_name": "Marcus Lee",
            "email_address": "marcus@example.com",
            "signup_ts": "2024-03-02T14:30:00Z",
        },
        {
            "user_id": 3,
            "full_name": "Priya Patel",
            "email_address": "priya@example.com",
            "signup_ts": "2024-06-21T09:15:00Z",
        },
    ],
    "billing-invoices": [
        {
            "invoiceId": "INV-1001",
            "cust": "Ava Thompson",
            "amountCents": 4599,
            "status": "paid",
            "due": "2024-02-01T00:00:00Z",
        },
        {
            "invoiceId": "INV-1002",
            "cust": "Marcus Lee",
            "amountCents": 12000,
            "status": "pending",
            "due": "2024-04-01T00:00:00Z",
        },
    ],
    "public-posts": [
        {
            "id": 1,
            "title": "API orchestration without custom routes",
            "body": "A gateway can normalize vendor data before it reaches client systems.",
            "userId": 101,
        },
        {
            "id": 2,
            "title": "One integration registry",
            "body": "Each integration entry defines auth, rate limits, target routes, and transforms.",
            "userId": 102,
        },
        {
            "id": 3,
            "title": "Client-safe credentials",
            "body": "Upstream API keys stay on the platform while clients use their own gateway key.",
            "userId": 103,
        },
    ],
}


st.set_page_config(
    page_title="API Integration Platform",
    page_icon="API",
    layout="wide",
    initial_sidebar_state="expanded",
)


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


INTEGRATIONS = load_json(INTEGRATIONS_PATH, [])
API_KEYS = load_json(API_KEYS_PATH, [])


def to_iso_date(value: Any) -> Any:
    if not value:
        return value
    try:
        normalized = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return value


def convert_value(value: Any, fn_name: str) -> Any:
    if fn_name == "centsToDollars" and isinstance(value, (int, float)):
        return round(value / 100, 2)
    if fn_name == "toISODate":
        return to_iso_date(value)
    if fn_name == "lowercase" and isinstance(value, str):
        return value.lower()
    return value


def get_nested(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def set_nested(data: dict[str, Any], path: str, value: Any) -> None:
    current = data
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def transform_item(item: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for source_path, spec in fields.items():
        if isinstance(spec, str):
            target_path = spec
            fn_name = "identity"
        else:
            target_path = spec.get("to", source_path)
            fn_name = spec.get("fn", "identity")

        value = get_nested(item, source_path)
        if value is not None:
            set_nested(output, target_path, convert_value(value, fn_name))
    return output


def transform_response(integration: dict[str, Any], data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    transform = integration.get("transform", {}).get("response", {})
    fields = transform.get("fields")
    if not fields:
        return data
    return [transform_item(item, fields) for item in data]


def record_metric(integration_id: str, status_code: int, duration_ms: int, api_key_name: str) -> None:
    st.session_state.metrics.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "integration": integration_id,
            "method": "GET",
            "statusCode": status_code,
            "durationMs": duration_ms,
            "apiKey": api_key_name,
            "success": status_code < 400,
        }
    )
    st.session_state.metrics = st.session_state.metrics[-500:]


def metrics_summary() -> dict[str, Any]:
    entries = st.session_state.metrics
    total = len(entries)
    errors = sum(1 for entry in entries if not entry["success"])
    avg_latency = round(sum(entry["durationMs"] for entry in entries) / total) if total else 0

    one_minute_ago = time.time() - 60
    last_minute = 0
    for entry in entries:
        timestamp = datetime.fromisoformat(entry["timestamp"]).timestamp()
        if timestamp >= one_minute_ago:
            last_minute += 1

    per_integration: dict[str, dict[str, int]] = {}
    for entry in entries:
        bucket = per_integration.setdefault(entry["integration"], {"requests": 0, "errors": 0, "latency": 0})
        bucket["requests"] += 1
        bucket["errors"] += 0 if entry["success"] else 1
        bucket["latency"] += entry["durationMs"]

    breakdown = [
        {
            "integration": integration,
            "requests": values["requests"],
            "errors": values["errors"],
            "avgLatencyMs": round(values["latency"] / values["requests"]),
        }
        for integration, values in per_integration.items()
    ]

    return {
        "totalRequests": total,
        "totalErrors": errors,
        "errorRate": round((errors / total) * 100, 1) if total else 0,
        "avgLatencyMs": avg_latency,
        "requestsLastMinute": last_minute,
        "integrationBreakdown": breakdown,
    }


def find_integration(label: str) -> dict[str, Any]:
    for integration in INTEGRATIONS:
        if f"{integration['name']} ({integration['prefix']})" == label:
            return integration
    return INTEGRATIONS[0]


def valid_api_key(key: str) -> dict[str, Any] | None:
    for api_key in API_KEYS:
        if api_key["key"] == key and api_key.get("active"):
            return api_key
    return None


def css() -> None:
    st.markdown(
        """
        <style>
        .stApp {
            background: #101421;
            color: #eef2ff;
        }
        [data-testid="stSidebar"] {
            background: #161b2e;
            border-right: 1px solid #2a3152;
        }
        [data-testid="stMetricValue"] {
            color: #f5c56b;
        }
        .hero {
            padding: 18px 0 8px;
        }
        .hero h1 {
            font-size: 2.4rem;
            line-height: 1.1;
            margin: 0 0 8px;
        }
        .hero p {
            color: #aab2d5;
            font-size: 1rem;
            margin: 0;
            max-width: 820px;
        }
        .pill {
            display: inline-block;
            padding: 5px 9px;
            border: 1px solid #394266;
            color: #c7d2fe;
            border-radius: 999px;
            font-size: 0.8rem;
            margin: 0 8px 8px 0;
        }
        .endpoint {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            background: #0b1020;
            border: 1px solid #293154;
            border-radius: 8px;
            padding: 10px 12px;
            color: #9be4d8;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_overview() -> None:
    st.markdown(
        """
        <div class="hero">
          <h1>API Integration Platform</h1>
          <p>A deployable client demo for gateway routing, response transformation, monitoring, and generated API documentation.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    cols = st.columns(4)
    cols[0].metric("Integrations", len(INTEGRATIONS))
    cols[1].metric("Client API Keys", len([key for key in API_KEYS if key.get("active")]))
    cols[2].metric("Demo Routes", len(INTEGRATIONS))
    cols[3].metric("Runtime", "Streamlit")

    st.subheader("What The Client Can See")
    st.write(
        "This Streamlit deployment packages the working API platform as an online demo. "
        "It shows the same core idea as the Node app: clients call one clean gateway while the platform handles upstream shape differences."
    )

    for integration in INTEGRATIONS:
        st.markdown(
            f"""
            <span class="pill">{integration["name"]}</span>
            <div class="endpoint">GET {integration["prefix"]}</div>
            """,
            unsafe_allow_html=True,
        )
        st.caption(integration.get("description", ""))


def render_live_demo() -> None:
    st.subheader("Live Gateway Demo")
    st.caption("Run a simulated gateway request and see the transformed response.")

    labels = [f"{item['name']} ({item['prefix']})" for item in INTEGRATIONS]
    selected = st.selectbox("Integration", labels)
    integration = find_integration(selected)
    api_key = st.text_input("Client API key", value="demo-key-123", type="password")

    col_a, col_b = st.columns([1, 2])
    with col_a:
        run = st.button("Send demo request", type="primary", use_container_width=True)
    with col_b:
        st.markdown(f"<div class='endpoint'>GET {integration['prefix']}</div>", unsafe_allow_html=True)

    if run:
        start = time.perf_counter()
        key_info = valid_api_key(api_key)
        if not key_info:
            duration = random.randint(8, 30)
            record_metric(integration["id"], 401, duration, "Unknown")
            st.error("Invalid API key. Use demo-key-123 or partner-key-456.")
            return

        raw_data = MOCK_RESPONSES.get(integration["id"], [])
        transformed = transform_response(integration, raw_data)
        duration = max(8, round((time.perf_counter() - start) * 1000) + random.randint(18, 95))
        record_metric(integration["id"], 200, duration, key_info["name"])

        st.success(f"Request completed in {duration} ms")
        st.write("Transformed response")
        st.dataframe(pd.DataFrame(transformed), use_container_width=True, hide_index=True)
        with st.expander("View JSON"):
            st.json(transformed)


def render_monitoring() -> None:
    st.subheader("Monitoring")
    st.caption("Metrics are stored in this Streamlit session so clients can see requests appear as they test the demo.")

    summary = metrics_summary()
    cols = st.columns(5)
    cols[0].metric("Total Requests", summary["totalRequests"])
    cols[1].metric("Errors", summary["totalErrors"])
    cols[2].metric("Error Rate", f"{summary['errorRate']}%")
    cols[3].metric("Avg Latency", f"{summary['avgLatencyMs']} ms")
    cols[4].metric("Last Minute", summary["requestsLastMinute"])

    if summary["integrationBreakdown"]:
        st.write("Integration breakdown")
        st.dataframe(pd.DataFrame(summary["integrationBreakdown"]), use_container_width=True, hide_index=True)

    if st.session_state.metrics:
        st.write("Recent requests")
        recent = list(reversed(st.session_state.metrics[-25:]))
        st.dataframe(pd.DataFrame(recent), use_container_width=True, hide_index=True)
    else:
        st.info("Send a demo request to populate monitoring data.")


def render_docs() -> None:
    st.subheader("API Documentation")
    st.caption("Client-facing route reference generated from the integration registry.")

    for integration in INTEGRATIONS:
        with st.expander(f"{integration['name']} - GET {integration['prefix']}", expanded=True):
            st.write(integration.get("description", ""))
            st.markdown(f"<div class='endpoint'>GET {integration['prefix']}</div>", unsafe_allow_html=True)
            st.write("Accepted client header")
            st.code("x-api-key: demo-key-123", language="http")
            st.write("Transform mapping")
            fields = integration.get("transform", {}).get("response", {}).get("fields", {})
            rows = []
            for source, target in fields.items():
                if isinstance(target, str):
                    rows.append({"source": source, "target": target, "function": "identity"})
                else:
                    rows.append({"source": source, "target": target.get("to"), "function": target.get("fn", "identity")})
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def render_deploy_notes() -> None:
    st.subheader("Deployment")
    st.write("Use these settings on Streamlit Community Cloud:")
    st.code(
        "\n".join(
            [
                "Repository: EngrShabir135/api-integration-platform",
                "Branch: main",
                "Main file path: streamlit_app.py",
            ]
        ),
        language="text",
    )
    st.write("After deploy, share the app URL with clients.")


def main() -> None:
    css()
    if "metrics" not in st.session_state:
        st.session_state.metrics = []

    st.sidebar.title("API Platform")
    page = st.sidebar.radio(
        "Navigate",
        ["Overview", "Live Demo", "Monitoring", "API Docs", "Deployment"],
    )

    st.sidebar.divider()
    st.sidebar.caption("Demo API keys")
    st.sidebar.code("demo-key-123\npartner-key-456", language="text")

    if page == "Overview":
        render_overview()
    elif page == "Live Demo":
        render_live_demo()
    elif page == "Monitoring":
        render_monitoring()
    elif page == "API Docs":
        render_docs()
    else:
        render_deploy_notes()


if __name__ == "__main__":
    main()
