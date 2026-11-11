from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.db.models.entities import (
    REAnnotationModel,
    REFunctionModel,
    REProjectModel,
    RESampleModel,
)
from app.db.session import AsyncSessionLocal
from app.re.assistant import REAssistant
from app.re.backends.base import DisasmInstruction, FunctionAnalysis
from app.re.backends.dispatcher import BinaryDispatcher
from app.re.callgraph import CallGraphBuilder
from app.re.quarantine import QuarantineStore

router = APIRouter(prefix="/re", tags=["Reverse Engineering Suite"])


class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None


class CreateAnnotationRequest(BaseModel):
    function_id: str
    annotation_type: str  # "rename", "comment", "type"
    content: str


@router.post("/projects")
async def create_project(req: CreateProjectRequest) -> dict[str, Any]:
    p_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_proj = REProjectModel(id=p_id, name=req.name, description=req.description)
        db.add(new_proj)
        await db.commit()

    return {"id": p_id, "name": req.name, "description": req.description}


@router.get("/projects")
async def list_projects() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(REProjectModel).order_by(desc(REProjectModel.created_at)))
        projects = res.scalars().all()
        return [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in projects
        ]


@router.post("/samples/upload")
async def upload_sample(
    project_id: str = Query(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Uploads binary sample directly to quarantine (chmod 0400), parses metadata, and stores functions."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 1. Quarantine
    q_meta = QuarantineStore.store_sample(content, original_filename=file.filename or "sample.bin")

    # 2. Static Analysis
    try:
        analysis = BinaryDispatcher.analyze_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Static binary analysis failed: {e}") from e

    # 3. Store sample in DB
    sample_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_sample = RESampleModel(
            id=sample_id,
            project_id=project_id,
            sha256=q_meta["sha256"],
            md5=q_meta["md5"],
            sha1=q_meta["sha1"],
            file_type=analysis.file_format,
            file_size=q_meta["file_size"],
            quarantine_filename=q_meta["quarantine_filename"],
            is_quarantined_ro=True,
        )
        db.add(new_sample)

        # Store detected functions
        for f in analysis.functions:
            fn_id = str(uuid.uuid4())
            new_fn = REFunctionModel(
                id=fn_id,
                sample_id=sample_id,
                address=hex(f.address),
                name=f.name,
                size=f.size,
                assembly_json=[i.to_dict() for i in f.instructions],
                callgraph_json={"callees": f.callees},
                hash=f.hash,
            )
            db.add(new_fn)

        await db.commit()

    return {
        "id": sample_id,
        "project_id": project_id,
        "metadata": q_meta,
        "analysis": analysis.to_dict(),
    }


@router.get("/samples/{sample_id}")
async def get_sample_details(sample_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(RESampleModel).where(RESampleModel.id == sample_id))
        sample = res.scalars().first()
        if not sample:
            raise HTTPException(status_code=404, detail="Sample not found")

        # Read quarantined bytes to re-analyze sections & strings
        raw_bytes = QuarantineStore.read_sample_bytes(sample.sha256)
        analysis = BinaryDispatcher.analyze_bytes(raw_bytes)

        return {
            "id": sample.id,
            "project_id": sample.project_id,
            "sha256": sample.sha256,
            "md5": sample.md5,
            "sha1": sample.sha1,
            "file_type": sample.file_type,
            "file_size": sample.file_size,
            "is_quarantined_ro": sample.is_quarantined_ro,
            "analysis": analysis.to_dict(),
        }


@router.get("/samples/{sample_id}/functions")
async def list_sample_functions(sample_id: str) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(REFunctionModel)
            .where(REFunctionModel.sample_id == sample_id)
            .order_by(REFunctionModel.address)
        )
        fns = res.scalars().all()
        return [
            {
                "id": fn.id,
                "name": fn.name,
                "address": fn.address,
                "address_int": int(fn.address, 16)
                if fn.address.startswith("0x")
                else int(fn.address),
                "size": fn.size,
                "hash": fn.hash,
            }
            for fn in fns
        ]


@router.get("/functions/{function_id}")
async def get_function_details(function_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(REFunctionModel).where(REFunctionModel.id == function_id))
        fn = res.scalars().first()
        if not fn:
            raise HTTPException(status_code=404, detail="Function not found")

        return {
            "id": fn.id,
            "sample_id": fn.sample_id,
            "name": fn.name,
            "address": fn.address,
            "size": fn.size,
            "assembly": fn.assembly_json or [],
            "callgraph": fn.callgraph_json or {},
            "hash": fn.hash,
        }


@router.get("/samples/{sample_id}/callgraph")
async def get_sample_callgraph(sample_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(REFunctionModel).where(REFunctionModel.sample_id == sample_id)
        )
        fns = res.scalars().all()
        func_analyses: list[FunctionAnalysis] = []
        for fn in fns:
            callees = (fn.callgraph_json or {}).get("callees", [])
            int_addr = int(fn.address, 16) if fn.address.startswith("0x") else int(fn.address)
            func_analyses.append(
                FunctionAnalysis(
                    name=fn.name,
                    address=int_addr,
                    size=fn.size,
                    hash=fn.hash or "",
                    callees=callees,
                )
            )

        return CallGraphBuilder.build_graph(func_analyses)


@router.post("/functions/{function_id}/analyze")
async def analyze_function(function_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(REFunctionModel).where(REFunctionModel.id == function_id))
        fn = res.scalars().first()
        if not fn:
            raise HTTPException(status_code=404, detail="Function not found")

        callees = (fn.callgraph_json or {}).get("callees", [])
        insns = [
            DisasmInstruction(
                address=i["address_int"],
                mnemonic=i["mnemonic"],
                op_str=i["op_str"],
                size=i["size"],
                bytes_hex=i["bytes_hex"],
            )
            for i in (fn.assembly_json or [])
        ]
        int_addr = int(fn.address, 16) if fn.address.startswith("0x") else int(fn.address)
        func_obj = FunctionAnalysis(
            name=fn.name,
            address=int_addr,
            size=fn.size,
            hash=fn.hash or "",
            instructions=insns,
            callees=callees,
        )

        analysis_res = await REAssistant.analyze_function(func=func_obj)
        return analysis_res


@router.post("/samples/{sample_id}/yara")
async def generate_yara(sample_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(RESampleModel).where(RESampleModel.id == sample_id))
        sample = res.scalars().first()
        if not sample:
            raise HTTPException(status_code=404, detail="Sample not found")

        raw_bytes = QuarantineStore.read_sample_bytes(sample.sha256)
        analysis = BinaryDispatcher.analyze_bytes(raw_bytes)

        rule_text = REAssistant.generate_yara_rule(
            sample_meta={"sha256": sample.sha256, "file_size": sample.file_size},
            strings=analysis.strings,
        )
        return {"rule": rule_text}


@router.get("/samples/{sample_id}/hex")
async def get_sample_hex(
    sample_id: str,
    offset: int = Query(0, ge=0),
    length: int = Query(256, ge=1, le=4096),
) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(RESampleModel).where(RESampleModel.id == sample_id))
        sample = res.scalars().first()
        if not sample:
            raise HTTPException(status_code=404, detail="Sample not found")

        chunk = QuarantineStore.read_sample_bytes(sample.sha256, offset=offset, length=length)
        return {
            "offset": offset,
            "length": len(chunk),
            "hex": chunk.hex(),
            "ascii": "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk),
        }


@router.post("/annotations")
async def add_annotation(req: CreateAnnotationRequest) -> dict[str, Any]:
    ann_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_ann = REAnnotationModel(
            id=ann_id,
            function_id=req.function_id,
            version=1,
            author="Sedat-gigglemorgan",
            annotation_type=req.annotation_type,
            content=req.content,
            applied=True,
        )
        db.add(new_ann)
        await db.commit()

    return {
        "id": ann_id,
        "function_id": req.function_id,
        "annotation_type": req.annotation_type,
        "content": req.content,
    }
