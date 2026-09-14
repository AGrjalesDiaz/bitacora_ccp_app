@echo off
REM Script de instalación rápida para Windows

echo.
echo ====================================
echo   Bitácora CCP - Instalación Rápida
echo ====================================
echo.

REM Limpiar node_modules viejo
if exist node_modules (
    echo Limpiando instalación anterior...
    rmdir /s /q node_modules
)

if exist package-lock.json (
    del package-lock.json
)

REM Instalar con flags de velocidad
echo.
echo Instalando dependencias (esto toma 3-5 minutos en primera vez)...
echo.

call npm install --no-optional --no-audit --no-fund

if errorlevel 1 (
    echo.
    echo ERROR: npm install falló
    echo Intenta: npm install --legacy-peer-deps
    pause
    exit /b 1
)

echo.
echo ✓ Dependencias instaladas
echo.
echo Cargando catálogo en base de datos...
call npm run seed

if errorlevel 1 (
    echo ERROR: npm run seed falló
    pause
    exit /b 1
)

echo.
echo ✓ Catálogo cargado
echo.
echo ====================================
echo   Listo para iniciar
echo ====================================
echo.
echo Ejecuta ahora: npm start
echo.
echo Luego abre: http://localhost:3000
echo.
pause
