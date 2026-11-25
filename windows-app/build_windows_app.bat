@echo off
setlocal
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist "%CSC%" (
  echo [ERROR] .NET Framework 4.x csc.exe not found!
  exit /b 1
)

echo Building WindowsApp.exe ...
"%CSC%" /nologo /target:winexe /optimize+ /utf8output /codepage:65001 ^
  /out:"%~dp0WindowsApp.exe" ^
  /reference:System.Windows.Forms.dll ^
  /reference:System.Drawing.dll ^
  /reference:System.Web.Extensions.dll ^
  /reference:System.Net.Http.dll ^
  "%~dp0WindowsApp.cs"

if errorlevel 1 (
  echo [ERROR] Build failed!
  exit /b 1
)

echo [OK] Built "%~dp0WindowsApp.exe" successfully!
endlocal
