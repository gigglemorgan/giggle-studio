import argparse
import asyncio
import sys
from pathlib import Path


def run_server() -> None:
    """Launches the Giggle Studio server."""
    import uvicorn

    # Add backend directory to sys.path
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.core.config import settings

    print(f"🚀 Starting Giggle Studio at http://{settings.server.host}:{settings.server.port}")
    uvicorn.run(
        "app.main:app",
        host=settings.server.host,
        port=settings.server.port,
        reload=settings.debug,
        app_dir=str(backend_dir),
    )


def run_doctor() -> None:
    """Runs diagnostics from the CLI."""
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.api.system import run_doctor_diagnostics

    report = asyncio.run(run_doctor_diagnostics())
    print("\n" + "=" * 60)
    print("          GIGGLE STUDIO - SISTEM DOKTORU")
    print("=" * 60)
    print(f"Genel Durum: {report.get('status', 'unknown').upper()}\n")

    for check in report.get("checks", []):
        status_symbol = (
            "✅" if check["status"] == "pass" else "⚠️" if check["status"] == "warn" else "ℹ️"
        )
        print(f"{status_symbol} {check['name']}")
        print(f"   Hedef:    {check['target']}")
        print(f"   Ölçülen:  {check['measured']}")
        if check.get("fix"):
            print(f"   Çözüm:    {check['fix']}")
        print("-" * 60)


def run_setup() -> None:
    """Initializes workspace and databases."""
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from app.core.config import settings
    from app.db.session import init_db

    print("🔧 Giggle Studio veri dizinleri ve veritabanı kuruluyor...")
    for d in [
        settings.storage.data_dir,
        settings.storage.models_dir,
        settings.storage.datasets_dir,
        settings.storage.workspaces_dir,
        settings.storage.quarantine_dir,
        settings.storage.logs_dir,
        settings.plugins.directory,
    ]:
        d.mkdir(parents=True, exist_ok=True)
        print(f"  ✓ Dizin oluşturuldu/doğrulandı: {d}")

    asyncio.run(init_db())
    print("  ✓ Veritabanı tabloları oluşturuldu.")
    print("✅ Kurulum tamamlandı!")


def run_bench() -> None:
    """Runs quick benchmark suite."""
    print("⚡ Giggle Studio Model Benchmark Modülü")
    print(
        "Model benchmark çalıştırmak için lütfen Model Yöneticisi sayfasını kullanın veya model yolu belirtin."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Giggle Studio CLI")
    subparsers = parser.add_subparsers(dest="command", help="Komutlar")

    subparsers.add_parser("run", help="Giggle Studio sunucusunu başlatır")
    subparsers.add_parser("doctor", help="Sistem ve donanım gereksinimlerini kontrol eder")
    subparsers.add_parser("setup", help="Veri dizinlerini ve veritabanını hazırlar")
    subparsers.add_parser("bench", help="Model performans testlerini çalıştırır")

    args = parser.parse_args()
    if args.command == "run":
        run_server()
    elif args.command == "doctor":
        run_doctor()
    elif args.command == "setup":
        run_setup()
    elif args.command == "bench":
        run_bench()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
