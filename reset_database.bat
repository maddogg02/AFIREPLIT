@echo off
REM Reset AFI App Database - Clears all documents and ChromaDB storage
REM Run this to start fresh with re-uploaded documents

echo ====================================
echo AFI APP DATABASE RESET
echo ====================================
echo.
echo WARNING: This will delete:
echo - All ChromaDB embeddings
echo - You'll need to re-upload all PDF documents
echo.
pause

echo.
echo [1/2] Deleting ChromaDB storage...
rd /s /q "chroma_storage_openai"
if exist "chroma_storage_openai" (
    echo Failed to delete chroma_storage_openai
    exit /b 1
)
echo [SUCCESS] ChromaDB storage deleted

echo.
echo [2/2] Database reset complete!
echo.
echo Next steps:
echo 1. Start the server (run quick-start.bat)
echo 2. Re-upload your PDF documents through the web interface
echo.
pause
