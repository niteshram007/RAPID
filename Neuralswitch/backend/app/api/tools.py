"""Tool endpoints for routing and explicit tool calls."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tool_log import ToolLog
from app.schemas.tool import (
    CalculateRequest,
    ToolRouteRequest,
    ToolRouteResponse,
    WebSearchRequest,
)
from app.services import calculator_service, settings_service, web_search_service
from app.tools import tool_router

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/route", response_model=ToolRouteResponse)
def route_message(req: ToolRouteRequest):
    route, reasons = tool_router.classify(req.message, use_rag=req.use_rag, use_web=req.use_web)
    return ToolRouteResponse(route=route, reasons=reasons)


@router.post("/calculate")
def calculate(req: CalculateRequest, db: Session = Depends(get_db)):
    try:
        result = calculator_service.evaluate_question(req.expression)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid calculation expression: {exc}") from exc
    db.add(ToolLog(tool_name="calculator", input={"expression": req.expression}, output={"result": result.result}, status="ok"))
    db.commit()
    return {"expression": result.expression, "result": result.result}


@router.post("/web-search")
async def web_search(req: WebSearchRequest, db: Session = Depends(get_db)):
    cfg = settings_service.get_effective_settings(db)
    if not cfg.get("web_search_enabled", True):
        raise HTTPException(status_code=400, detail="Web search is disabled in settings.")
    max_results = req.max_results or int(cfg.get("web_search_max_results", 5))
    try:
        results = await web_search_service.search(req.query, max_results=max_results, prefer_current=True)
    except Exception as exc:
        db.add(ToolLog(tool_name="web_search", input={"query": req.query}, output={"error": str(exc)}, status="error"))
        db.commit()
        raise HTTPException(status_code=502, detail=f"Web search failed: {exc}") from exc

    db.add(ToolLog(tool_name="web_search", input={"query": req.query}, output={"count": len(results)}, status="ok"))
    db.commit()
    return {"query": req.query, "results": results}
