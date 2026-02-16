@echo off
cd /d C:\Users\kimsehun\Desktop\proj\Autopolio
set "DATABASE_URL=sqlite+aiosqlite:///C:/Users/kimsehun/AppData/Roaming/autopolio-frontend/data/autopolio.db"
set "SECRET_KEY=QnXHWWQkyAWhEl9dFyKbRo/NH4/X2eHXUdA+UvydQPY="
python -m uvicorn api.main:app --host 127.0.0.1 --port 8085
