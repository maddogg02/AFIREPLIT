@echo off
REM Reset ChromaDB vector store and rebuild from PDFs
echo ====================================
echo ChromaDB Reset and Rebuild Utility
echo ====================================
echo.

echo [1/3] Backing up current ChromaDB state...
if exist "chroma_storage_openai_backup" rmdir /s /q "chroma_storage_openai_backup"
if exist "chroma_storage_openai" (
    xcopy "chroma_storage_openai" "chroma_storage_openai_backup\" /E /I /H /Y
    echo Backup created: chroma_storage_openai_backup
) else (
    echo No existing ChromaDB found - starting fresh
)
echo.

echo [2/3] Clearing corrupted ChromaDB storage...
if exist "chroma_storage_openai" (
    rmdir /s /q "chroma_storage_openai"
    echo ChromaDB storage cleared
)
echo.

echo [3/3] ChromaDB reset complete!
echo.
echo NEXT STEPS:
echo 1. Re-upload your PDFs through the web interface (http://localhost:5000/upload)
echo 2. Or run: python server/scripts/ingest/batch_ingest.py
echo.
echo Your backup is saved in: chroma_storage_openai_backup
echo.
pause
