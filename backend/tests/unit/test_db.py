import pytest
from app.db.models.entities import SettingModel
from app.db.session import AsyncSessionLocal, init_db
from sqlalchemy import select


@pytest.mark.asyncio
async def test_database_initialization():
    await init_db()
    async with AsyncSessionLocal() as session:
        # Create and retrieve a setting
        setting = SettingModel(key="test_key", value_json={"foo": "bar"})
        session.add(setting)
        await session.commit()

        result = await session.execute(select(SettingModel).where(SettingModel.key == "test_key"))
        retrieved = result.scalar_one_or_none()
        assert retrieved is not None
        assert retrieved.value_json == {"foo": "bar"}

        # Clean up
        await session.delete(retrieved)
        await session.commit()
