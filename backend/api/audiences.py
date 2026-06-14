from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
from schemas.pydantic_models import AudienceRequest
import services.audience_service as audience_service

router = APIRouter(prefix="/audiences", tags=["audiences"])


@router.post("/generate")
async def generate_audience(body: AudienceRequest, db: AsyncSession = Depends(get_db)):
    """Convert a natural language query into a qualified audience segment."""
    result = await audience_service.generate_audience(body.query, db)
    return result
