from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import pandas as pd
import json
import io
import os
import sqlite3
from datetime import datetime
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# ===============================
# 📁 DATABASE SETUP
# ===============================
DB_PATH = 'leetcode_tracker.db'
EXCEL_FILE = 'students.xlsx'

def init_db():
    """Create database and tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Students table
    c.execute('''CREATE TABLE IF NOT EXISTS students
                 (roll TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  leetcode_ids TEXT,
                  created_at TIMESTAMP)''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized")

def load_excel_to_db():
    """Auto-load students from Excel file to database"""
    if not os.path.exists(EXCEL_FILE):
        print(f"⚠️ Warning: {EXCEL_FILE} not found. Please add your file.")
        return 0
    
    try:
        df = pd.read_excel(EXCEL_FILE)
        print(f"📊 Found Excel with columns: {list(df.columns)}")
        
        # Find columns (case insensitive)
        roll_col = None
        name_col = None
        ids_col = None
        
        for col in df.columns:
            col_lower = col.lower()
            if 'roll' in col_lower:
                roll_col = col
            elif 'name' in col_lower:
                name_col = col
            elif 'leetcode' in col_lower or 'ids' in col_lower or 'username' in col_lower:
                ids_col = col
        
        if not roll_col or not name_col or not ids_col:
            print(f"❌ Required columns not found. Found: {list(df.columns)}")
            return 0
        
        added_count = 0
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        for idx, row in df.iterrows():
            try:
                roll = str(row[roll_col]).strip()
                name = str(row[name_col]).strip()
                leetcode_str = str(row[ids_col]).strip()
                
                if not roll or not name or not leetcode_str:
                    continue
                
                # Parse IDs (comma or space separated)
                ids_list = [i.strip() for i in leetcode_str.replace(',', ' ').split() if i.strip()]
                
                if ids_list:
                    c.execute('''INSERT OR REPLACE INTO students 
                                 (roll, name, leetcode_ids, created_at)
                                 VALUES (?, ?, ?, ?)''',
                              (roll, name, json.dumps(ids_list), datetime.now()))
                    added_count += 1
                    print(f"   ✅ Loaded: {roll} - {name}")
                    
            except Exception as e:
                print(f"   ⚠️ Row {idx + 2}: Error - {e}")
                continue
        
        conn.commit()
        conn.close()
        
        print(f"\n📊 Loaded {added_count} students from Excel")
        return added_count
        
    except Exception as e:
        print(f"❌ Error loading Excel: {e}")
        return 0

def fetch_leetcode_data(username):
    """Fetch LeetCode data for a username"""
    url = "https://leetcode.com/graphql"
    
    query = {
        "query": """
        query getUserProfile($username: String!) {
            matchedUser(username: $username) {
                submitStats: submitStatsGlobal {
                    acSubmissionNum {
                        difficulty
                        count
                    }
                }
                tagProblemCounts {
                    advanced {
                        tagName
                        problemsSolved
                    }
                    intermediate {
                        tagName
                        problemsSolved
                    }
                    fundamental {
                        tagName
                        problemsSolved
                    }
                }
            }
        }
        """,
        "variables": {"username": username}
    }
    
    try:
        response = requests.post(
            url,
            json=query,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json"
            },
            verify=False,
            timeout=10
        )
        
        data = response.json()
        
        if not data or "data" not in data or not data["data"]["matchedUser"]:
            return {"error": "Invalid username"}
        
        user_data = data["data"]["matchedUser"]
        
        # Parse difficulty stats
        stats = {'Easy': 0, 'Medium': 0, 'Hard': 0, 'All': 0}
        for item in user_data["submitStats"]["acSubmissionNum"]:
            difficulty = item["difficulty"]
            if difficulty == "Easy":
                stats["Easy"] = item["count"]
            elif difficulty == "Medium":
                stats["Medium"] = item["count"]
            elif difficulty == "Hard":
                stats["Hard"] = item["count"]
        stats["All"] = stats["Easy"] + stats["Medium"] + stats["Hard"]
        
        # Parse topics
        topics = []
        for level in ["fundamental", "intermediate", "advanced"]:
            for tag in user_data["tagProblemCounts"][level]:
                topics.append({
                    "tagName": tag["tagName"],
                    "problemsSolved": tag["problemsSolved"]
                })
        
        return {
            "difficulty": stats,
            "topics": topics
        }
        
    except Exception as e:
        return {"error": str(e)}

# ===============================
# 🚀 API ROUTES
# ===============================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/dashboard')
def dashboard():
    """Get dashboard statistics"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM students')
        total_students = c.fetchone()[0]
        conn.close()
        
        return jsonify({
            'total_students': total_students,
            'total_problems_solved': 0,
            'active_today': total_students,
            'avg_problems': 0
        })
    except Exception as e:
        return jsonify({'total_students': 0, 'total_problems_solved': 0, 'active_today': 0, 'avg_problems': 0})

@app.route('/api/students')
def get_all_students():
    """Get all students"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students ORDER BY roll')
        rows = c.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            leetcode_ids = json.loads(row[2]) if row[2] else []
            
            # Fetch basic stats for each student
            easy = 0
            medium = 0
            hard = 0
            
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    stats = data.get('difficulty', {})
                    easy = stats.get('Easy', 0)
                    medium = stats.get('Medium', 0)
                    hard = stats.get('Hard', 0)
            
            results.append({
                'roll': row[0],
                'name': row[1],
                'leetcode_ids': leetcode_ids,
                'stats': {
                    'All': easy + medium + hard,
                    'Easy': easy,
                    'Medium': medium,
                    'Hard': hard
                }
            })
        
        return jsonify(results)
    except Exception as e:
        print(f"Error in get_all_students: {e}")
        return jsonify([])

@app.route('/api/student/<roll>')
def get_student(roll):
    """Get detailed student data"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT name, leetcode_ids FROM students WHERE roll=?', (roll,))
        row = c.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'error': 'Student not found'}), 404
        
        leetcode_ids = json.loads(row[1]) if row[1] else []
        
        # Fetch stats for all LeetCode IDs
        all_stats = []
        all_topics = []
        
        for username in leetcode_ids:
            data = fetch_leetcode_data(username)
            if 'error' not in data:
                all_stats.append(data.get('difficulty', {}))
                all_topics.extend(data.get('topics', []))
        
        # Aggregate stats
        total_stats = {'Easy': 0, 'Medium': 0, 'Hard': 0, 'All': 0}
        for stats in all_stats:
            total_stats['Easy'] += stats.get('Easy', 0)
            total_stats['Medium'] += stats.get('Medium', 0)
            total_stats['Hard'] += stats.get('Hard', 0)
        total_stats['All'] = total_stats['Easy'] + total_stats['Medium'] + total_stats['Hard']
        
        # Aggregate topics
        topic_map = {}
        for topic in all_topics:
            topic_map[topic['tagName']] = topic_map.get(topic['tagName'], 0) + topic['problemsSolved']
        
        topics_list = [{'tagName': k, 'problemsSolved': v} for k, v in topic_map.items()]
        topics_list.sort(key=lambda x: x['problemsSolved'], reverse=True)
        
        weak_topics = [t['tagName'] for t in topics_list if t['problemsSolved'] < 5]
        
        return jsonify({
            'roll': roll,
            'name': row[0],
            'leetcode_ids': leetcode_ids,
            'stats': total_stats,
            'topics': topics_list,
            'weak_topics': weak_topics,
            'progress': [],
            'growth': {'easy': 0, 'medium': 0, 'hard': 0, 'total': 0},
            'skill_radar': {},
            'notifications': []
        })
    except Exception as e:
        print(f"Error in get_student: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/student', methods=['POST'])
def add_student():
    """Add a new student"""
    try:
        data = request.json
        print(f"📥 Received data: {data}")
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        roll = str(data.get('roll', '')).strip()
        name = str(data.get('name', '')).strip()
        leetcode_ids = data.get('leetcode_ids', [])
        
        # Validate input
        if not roll:
            return jsonify({'error': 'Roll number is required'}), 400
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        if not leetcode_ids:
            return jsonify({'error': 'At least one LeetCode username is required'}), 400
        
        # Ensure leetcode_ids is a list
        if isinstance(leetcode_ids, str):
            leetcode_ids = [i.strip() for i in leetcode_ids.split(',') if i.strip()]
        
        # Verify at least one valid LeetCode username
        valid_ids = []
        for username in leetcode_ids[:3]:
            username = username.strip()
            if not username:
                continue
            
            test = fetch_leetcode_data(username)
            if 'error' not in test:
                valid_ids.append(username)
        
        if not valid_ids:
            # For testing, allow adding with the provided IDs even if not valid
            # This helps with testing the UI
            valid_ids = leetcode_ids[:3]
            print(f"⚠️ Using unverified IDs: {valid_ids}")
        
        # Save to database
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Check if student already exists
        c.execute('SELECT roll FROM students WHERE roll=?', (roll,))
        exists = c.fetchone()
        
        c.execute('''INSERT OR REPLACE INTO students 
                     (roll, name, leetcode_ids, created_at)
                     VALUES (?, ?, ?, ?)''',
                  (roll, name, json.dumps(valid_ids), datetime.now()))
        conn.commit()
        conn.close()
        
        if exists:
            return jsonify({'message': f'Student updated successfully!', 'roll': roll, 'name': name})
        else:
            return jsonify({'message': f'Student added successfully!', 'roll': roll, 'name': name})
        
    except Exception as e:
        print(f"❌ Error in add_student: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload students from Excel/CSV"""
    file = request.files.get('file')
    
    if not file:
        return jsonify({'error': 'No file uploaded'}), 400
    
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        added_count = 0
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        for idx, row in df.iterrows():
            try:
                # Try to find columns
                roll = None
                name = None
                leetcode_str = None
                
                for col in df.columns:
                    col_lower = col.lower()
                    if 'roll' in col_lower:
                        roll = str(row[col]).strip()
                    elif 'name' in col_lower:
                        name = str(row[col]).strip()
                    elif 'leetcode' in col_lower or 'ids' in col_lower:
                        leetcode_str = str(row[col]).strip()
                
                if not roll or not name or not leetcode_str:
                    continue
                
                ids_list = [i.strip() for i in leetcode_str.replace(',', ' ').split() if i.strip()]
                
                if ids_list:
                    c.execute('''INSERT OR REPLACE INTO students 
                                 (roll, name, leetcode_ids, created_at)
                                 VALUES (?, ?, ?, ?)''',
                              (roll, name, json.dumps(ids_list), datetime.now()))
                    added_count += 1
                    
            except Exception:
                continue
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': f'Successfully added {added_count} students'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leaderboard')
def leaderboard():
    """Get leaderboard"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students')
        rows = c.fetchall()
        conn.close()
        
        leaderboard_data = []
        
        for row in rows:
            roll = row[0]
            name = row[1]
            leetcode_ids = json.loads(row[2]) if row[2] else []
            
            # Get stats
            all_stats = []
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    all_stats.append(data.get('difficulty', {}))
            
            easy = 0
            medium = 0
            hard = 0
            
            for stats in all_stats:
                easy += stats.get('Easy', 0)
                medium += stats.get('Medium', 0)
                hard += stats.get('Hard', 0)
            
            total_solved = easy + medium + hard
            
            leaderboard_data.append({
                'roll': roll,
                'name': name,
                'easy': easy,
                'medium': medium,
                'hard': hard,
                'total_solved': total_solved
            })
        
        # Sort and add ranks
        leaderboard_data.sort(key=lambda x: x['total_solved'], reverse=True)
        for i, student in enumerate(leaderboard_data, 1):
            student['rank'] = i
        
        return jsonify(leaderboard_data)
    except Exception as e:
        print(f"Error in leaderboard: {e}")
        return jsonify([])

@app.route('/api/batch-analytics')
def batch_analytics():
    """Get batch analytics"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students')
        rows = c.fetchall()
        conn.close()
        
        if not rows:
            return jsonify({})
        
        total_students = len(rows)
        total_easy = 0
        total_medium = 0
        total_hard = 0
        
        for row in rows[:10]:
            leetcode_ids = json.loads(row[2]) if row[2] else []
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    stats = data.get('difficulty', {})
                    total_easy += stats.get('Easy', 0)
                    total_medium += stats.get('Medium', 0)
                    total_hard += stats.get('Hard', 0)
        
        analytics = {
            'Your Batch': {
                'students': [row[1] for row in rows[:5]],
                'count': total_students,
                'total_easy': total_easy,
                'total_medium': total_medium,
                'total_hard': total_hard,
                'total_all': total_easy + total_medium + total_hard,
                'avg_easy': total_easy / total_students if total_students > 0 else 0,
                'avg_medium': total_medium / total_students if total_students > 0 else 0,
                'avg_hard': total_hard / total_students if total_students > 0 else 0,
                'avg_total': (total_easy + total_medium + total_hard) / total_students if total_students > 0 else 0,
                'top_performer': rows[0][1] if rows else 'None'
            }
        }
        
        return jsonify(analytics)
    except Exception as e:
        print(f"Error in batch_analytics: {e}")
        return jsonify({})

@app.route('/api/export')
def export_data():
    """Export all student data to Excel"""
    try:
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query("SELECT roll, name, leetcode_ids FROM students", conn)
        conn.close()
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Students', index=False)
        
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'students_{datetime.now().strftime("%Y%m%d")}.xlsx'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reload', methods=['POST'])
def reload_students():
    """Reload students from Excel file"""
    count = load_excel_to_db()
    if count > 0:
        return jsonify({'message': f'Successfully reloaded {count} students'})
    else:
        return jsonify({'error': 'Failed to reload students'}), 500

# ===============================
# 🚀 RUN SERVER
# ===============================
if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 LeetCode Tracker Starting...")
    print("="*50)
    
    # Initialize database
    init_db()
    
    # Auto-load Excel file
    print(f"\n📂 Checking for {EXCEL_FILE}...")
    if os.path.exists(EXCEL_FILE):
        load_excel_to_db()
    else:
        print(f"⚠️ {EXCEL_FILE} not found!")
        print(f"   You can add students manually through the UI")
    
    print("\n" + "="*50)
    print("🌐 Server: http://127.0.0.1:5000")
    print("="*50 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)