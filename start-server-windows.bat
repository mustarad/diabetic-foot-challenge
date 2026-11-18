@echo off
REM Diabetic Foot Challenge - local network server (no internet needed)
REM Requires Python installed. Keep this window open while the quiz is in use.
cd /d "%~dp0"
echo.
echo  Diabetic Foot Challenge - local server
echo  ---------------------------------------
echo  On this computer open:  http://localhost:8080
echo  On an iPad on the same Wi-Fi, open http://YOUR-IP:8080  using one of these addresses:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo     http:%%a:8080
echo.
echo  Close this window to stop the server.
echo.
where python >nul 2>nul && (python -m http.server 8080) || (py -m http.server 8080) || (echo Python is not installed. & pause)
