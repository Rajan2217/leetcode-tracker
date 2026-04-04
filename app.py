from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import json
import io
import os
import sqlite3
from datetime import datetime
import requests
import urllib3
import numpy as np
from collections import Counter

# Try to import pandas, but continue without it if not available
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
    print("✅ pandas available - upload/export features enabled")
except ImportError:
    PANDAS_AVAILABLE = False
    print("⚠️ pandas not available - upload/export features disabled")

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
    
    # Initialize courses and sections
    init_courses_sections()

# ===============================
# 📚 COURSE & SECTION MANAGEMENT
# ===============================

def init_courses_sections():
    """Initialize courses and sections tables with 2 sections per course"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Courses table
    c.execute('''CREATE TABLE IF NOT EXISTS courses
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  course_name TEXT NOT NULL,
                  course_code TEXT UNIQUE,
                  created_at TIMESTAMP)''')
    
    # Sections table
    c.execute('''CREATE TABLE IF NOT EXISTS sections
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  course_id INTEGER NOT NULL,
                  section_name TEXT NOT NULL,
                  section_code TEXT,
                  FOREIGN KEY (course_id) REFERENCES courses(id),
                  UNIQUE(course_id, section_name))''')
    
    # Student-course mapping
    c.execute('''CREATE TABLE IF NOT EXISTS student_course_mapping
                 (student_roll TEXT,
                  section_id INTEGER,
                  assigned_at TIMESTAMP,
                  FOREIGN KEY (student_roll) REFERENCES students(roll),
                  FOREIGN KEY (section_id) REFERENCES sections(id),
                  PRIMARY KEY (student_roll, section_id))''')
    
    # Insert sample data if empty
    c.execute("SELECT COUNT(*) FROM courses")
    if c.fetchone()[0] == 0:
        # ============================================
        # COURSES - 6 Courses
        # ============================================
        courses_data = [
            ("MCA", "MCA"),
            ("B.Tech CSE", "CSE"),
            ("B.Tech ECE", "ECE"),
            ("B.Tech Civil Engineering", "CIVIL"),
            ("B.Tech IT", "IT"),
            ("B.Tech Mechanical Engineering", "ME"),
        ]
        
        for course_name, course_code in courses_data:
            c.execute("INSERT INTO courses (course_name, course_code, created_at) VALUES (?, ?, ?)",
                      (course_name, course_code, datetime.now()))
        
        # Get course IDs
        c.execute("SELECT id, course_code FROM courses")
        courses = c.fetchall()
        
        # ============================================
        # SECTIONS - 2 Sections per Course
        # ============================================
        for course_id, course_code in courses:
            if course_code == "MCA":
                sections = [
                    (course_id, "MCA Section A", "MCA-A"),
                    (course_id, "MCA Section B", "MCA-B"),
                ]
            elif course_code == "CSE":
                sections = [
                    (course_id, "CSE Section A", "CSE-A"),
                    (course_id, "CSE Section B", "CSE-B"),
                ]
            elif course_code == "ECE":
                sections = [
                    (course_id, "ECE Section A", "ECE-A"),
                    (course_id, "ECE Section B", "ECE-B"),
                ]
            elif course_code == "CIVIL":
                sections = [
                    (course_id, "Civil Section A", "CIVIL-A"),
                    (course_id, "Civil Section B", "CIVIL-B"),
                ]
            elif course_code == "IT":
                sections = [
                    (course_id, "IT Section A", "IT-A"),
                    (course_id, "IT Section B", "IT-B"),
                ]
            elif course_code == "ME":
                sections = [
                    (course_id, "ME Section A", "ME-A"),
                    (course_id, "ME Section B", "ME-B"),
                ]
            else:
                sections = [
                    (course_id, f"{course_code} Section A", f"{course_code}-A"),
                    (course_id, f"{course_code} Section B", f"{course_code}-B"),
                ]
            
            for section in sections:
                c.execute("INSERT INTO sections (course_id, section_name, section_code) VALUES (?, ?, ?)", section)
    
    conn.commit()
    conn.close()
    print("✅ Courses & Sections tables initialized")
    print("   📚 Courses: MCA, CSE, ECE, CIVIL, IT, ME")
    print("   📋 2 Sections per course (A & B)")

def load_excel_to_db():
    """Auto-load students from Excel file to database"""
    if not PANDAS_AVAILABLE:
        print("⚠️ pandas not available - cannot load Excel file")
        return 0
    
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
    if not PANDAS_AVAILABLE:
        return jsonify({'error': 'Excel upload is not available. Please add students manually using the "+" button.'}), 400
    
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
        student_names = []
        
        for row in rows[:20]:
            leetcode_ids = json.loads(row[2]) if row[2] else []
            student_names.append(row[1])
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    stats = data.get('difficulty', {})
                    total_easy += stats.get('Easy', 0)
                    total_medium += stats.get('Medium', 0)
                    total_hard += stats.get('Hard', 0)
        
        analytics = {
            'Your Batch': {
                'students': student_names[:5],
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
    if not PANDAS_AVAILABLE:
        return jsonify({'error': 'Export is not available. pandas is not installed.'}), 400
    
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
# 📚 COURSE & SECTION API ROUTES
# ===============================

@app.route('/api/courses')
def get_courses():
    """Get all courses"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, course_name, course_code FROM courses ORDER BY course_name")
        rows = c.fetchall()
        conn.close()
        
        courses = [{'id': row[0], 'name': row[1], 'code': row[2]} for row in rows]
        return jsonify(courses)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/courses/<int:course_id>/sections')
def get_sections(course_id):
    """Get sections for a specific course"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, section_name, section_code FROM sections WHERE course_id = ? ORDER BY section_name", (course_id,))
        rows = c.fetchall()
        conn.close()
        
        sections = [{'id': row[0], 'name': row[1], 'code': row[2]} for row in rows]
        return jsonify(sections)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/section/<int:section_id>/dashboard')
def get_section_dashboard(section_id):
    """Get aggregated dashboard data for a section"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        c.execute('''SELECT s.id, s.section_name, s.section_code, c.course_name, c.course_code 
                     FROM sections s 
                     JOIN courses c ON s.course_id = c.id 
                     WHERE s.id = ?''', (section_id,))
        section_row = c.fetchone()
        
        if not section_row:
            return jsonify({'error': 'Section not found'}), 404
        
        c.execute('''SELECT s.roll, s.name, s.leetcode_ids 
                     FROM students s
                     JOIN student_course_mapping scm ON s.roll = scm.student_roll
                     WHERE scm.section_id = ?''', (section_id,))
        student_rows = c.fetchall()
        conn.close()
        
        students_data = []
        total_easy = 0
        total_medium = 0
        total_hard = 0
        
        for row in student_rows:
            roll = row[0]
            name = row[1]
            leetcode_ids = json.loads(row[2]) if row[2] else []
            
            stats = {'Easy': 0, 'Medium': 0, 'Hard': 0}
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    diff = data.get('difficulty', {})
                    stats['Easy'] = diff.get('Easy', 0)
                    stats['Medium'] = diff.get('Medium', 0)
                    stats['Hard'] = diff.get('Hard', 0)
            
            total_easy += stats['Easy']
            total_medium += stats['Medium']
            total_hard += stats['Hard']
            
            students_data.append({
                'roll': roll,
                'name': name,
                'stats': stats
            })
        
        students_data.sort(key=lambda x: x['stats']['Easy'] + x['stats']['Medium'] + x['stats']['Hard'], reverse=True)
        
        for i, student in enumerate(students_data, 1):
            student['rank'] = i
        
        total_students = len(students_data)
        total_solved = total_easy + total_medium + total_hard
        
        section_dashboard = {
            'section': {
                'id': section_row[0],
                'name': section_row[1],
                'code': section_row[2],
                'course_name': section_row[3],
                'course_code': section_row[4]
            },
            'stats': {
                'total_students': total_students,
                'total_easy': total_easy,
                'total_medium': total_medium,
                'total_hard': total_hard,
                'total_solved': total_solved,
                'avg_per_student': round(total_solved / total_students, 1) if total_students > 0 else 0
            },
            'students': students_data[:10],
            'leaderboard': students_data
        }
        
        return jsonify(section_dashboard)
        
    except Exception as e:
        print(f"Error in section dashboard: {e}")
        return jsonify({'error': str(e)}), 500

# ===============================
# 📚 SECTION ASSIGNMENT MANAGEMENT
# ===============================

@app.route('/api/student/<roll>/assignments')
def get_student_assignments(roll):
    """Get all section assignments for a student"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''SELECT s.id, s.section_name, s.section_code, c.course_name, c.course_code,
                            scm.assigned_at
                     FROM student_course_mapping scm
                     JOIN sections s ON scm.section_id = s.id
                     JOIN courses c ON s.course_id = c.id
                     WHERE scm.student_roll = ?''', (roll,))
        rows = c.fetchall()
        conn.close()
        
        assignments = [{
            'section_id': row[0],
            'section_name': row[1],
            'section_code': row[2],
            'course_name': row[3],
            'course_code': row[4],
            'assigned_at': row[5]
        } for row in rows]
        
        return jsonify(assignments)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/section-assignments')
def get_all_assignments():
    """Get all section assignments"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''SELECT scm.student_roll, s.name, s.leetcode_ids, 
                            sec.section_name, sec.section_code, c.course_name, c.course_code,
                            scm.assigned_at, sec.id as section_id
                     FROM student_course_mapping scm
                     JOIN students s ON scm.student_roll = s.roll
                     JOIN sections sec ON scm.section_id = sec.id
                     JOIN courses c ON sec.course_id = c.id
                     ORDER BY c.course_name, sec.section_name, s.name''')
        rows = c.fetchall()
        conn.close()
        
        assignments = []
        for row in rows:
            leetcode_ids = json.loads(row[2]) if row[2] else []
            assignments.append({
                'student_roll': row[0],
                'student_name': row[1],
                'leetcode_ids': leetcode_ids,
                'section_name': row[3],
                'section_code': row[4],
                'course_name': row[5],
                'course_code': row[6],
                'assigned_at': row[7],
                'section_id': row[8]
            })
        
        return jsonify(assignments)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/assign-student', methods=['POST'])
def assign_student_to_section():
    """Assign a student to a section (permanently saved to database)"""
    try:
        data = request.json
        student_roll = data.get('student_roll')
        section_id = data.get('section_id')
        
        if not student_roll or not section_id:
            return jsonify({'error': 'Student roll and section ID required'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        c.execute("SELECT roll, name FROM students WHERE roll = ?", (student_roll,))
        student = c.fetchone()
        if not student:
            conn.close()
            return jsonify({'error': 'Student not found'}), 404
        
        c.execute("SELECT id, section_name FROM sections WHERE id = ?", (section_id,))
        section = c.fetchone()
        if not section:
            conn.close()
            return jsonify({'error': 'Section not found'}), 404
        
        c.execute('''INSERT OR REPLACE INTO student_course_mapping 
                     (student_roll, section_id, assigned_at) VALUES (?, ?, ?)''',
                  (student_roll, section_id, datetime.now()))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': f'Student {student[1]} ({student_roll}) assigned to {section[1]} successfully',
            'student_roll': student_roll,
            'student_name': student[1],
            'section_id': section_id,
            'section_name': section[1]
        })
        
    except Exception as e:
        print(f"Error in assign_student: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/unassign-student', methods=['POST'])
def unassign_student():
    """Remove a student from a section"""
    try:
        data = request.json
        student_roll = data.get('student_roll')
        section_id = data.get('section_id')
        
        if not student_roll:
            return jsonify({'error': 'Student roll required'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        if section_id:
            c.execute("DELETE FROM student_course_mapping WHERE student_roll = ? AND section_id = ?",
                      (student_roll, section_id))
            message = f'Student {student_roll} removed from section'
        else:
            c.execute("DELETE FROM student_course_mapping WHERE student_roll = ?", (student_roll,))
            message = f'Student {student_roll} removed from all sections'
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': message, 'student_roll': student_roll})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===============================
# 🤖 AI & SMART FEATURES
# ===============================

@app.route('/api/ai/insights')
def get_ai_insights():
    """Get AI-powered insights about batch performance"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students')
        rows = c.fetchall()
        conn.close()
        
        if not rows:
            return jsonify({'insights': [], 'error': 'No data available'})
        
        student_performance = []
        weak_topics_all = []
        
        for row in rows[:20]:
            roll = row[0]
            name = row[1]
            leetcode_ids = json.loads(row[2]) if row[2] else []
            
            easy, medium, hard = 0, 0, 0
            topics = []
            
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    stats = data.get('difficulty', {})
                    easy = stats.get('Easy', 0)
                    medium = stats.get('Medium', 0)
                    hard = stats.get('Hard', 0)
                    topics = data.get('topics', [])
            
            total = easy + medium + hard
            student_performance.append({
                'name': name,
                'roll': roll,
                'total': total,
                'easy': easy,
                'medium': medium,
                'hard': hard
            })
            
            for topic in topics[:3]:
                if topic.get('problemsSolved', 0) < 3:
                    weak_topics_all.append(topic.get('tagName', ''))
        
        insights = []
        
        if student_performance:
            avg_total = np.mean([s['total'] for s in student_performance])
            max_total = max([s['total'] for s in student_performance])
            min_total = min([s['total'] for s in student_performance])
            
            insights.append({
                'type': 'overall',
                'icon': '📊',
                'title': 'Batch Performance Overview',
                'message': f'Average problems solved: {avg_total:.1f}. Range: {min_total} to {max_total} problems.',
                'priority': 'high'
            })
            
            top_student = max(student_performance, key=lambda x: x['total'])
            insights.append({
                'type': 'achievement',
                'icon': '🏆',
                'title': 'Top Performer',
                'message': f'{top_student["name"]} leads with {top_student["total"]} problems solved!',
                'priority': 'high'
            })
            
            struggling = [s for s in student_performance if s['total'] < 10]
            if struggling:
                insights.append({
                    'type': 'warning',
                    'icon': '⚠️',
                    'title': 'Students Needing Support',
                    'message': f'{len(struggling)} students have solved fewer than 10 problems. Consider additional mentoring.',
                    'priority': 'high'
                })
        
        if weak_topics_all:
            topic_counts = Counter(weak_topics_all)
            common_weak = topic_counts.most_common(3)
            insights.append({
                'type': 'topics',
                'icon': '📚',
                'title': 'Common Weak Areas',
                'message': f'Students struggle most with: {", ".join([t[0] for t in common_weak])}. Focus on these topics.',
                'priority': 'medium'
            })
        
        total_easy = sum([s['easy'] for s in student_performance])
        total_medium = sum([s['medium'] for s in student_performance])
        total_hard = sum([s['hard'] for s in student_performance])
        
        if total_hard < total_easy * 0.1 and total_easy > 0:
            insights.append({
                'type': 'suggestion',
                'icon': '💡',
                'title': 'Difficulty Balance',
                'message': 'Students are solving mostly easy problems. Encourage tackling more medium and hard problems for growth.',
                'priority': 'medium'
            })
        
        return jsonify({'insights': insights, 'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e), 'insights': []}), 500

@app.route('/api/ai/recommendations/<roll>')
def get_ai_recommendations(roll):
    """Get personalized problem recommendations for a student"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT name, leetcode_ids FROM students WHERE roll=?', (roll,))
        row = c.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'error': 'Student not found'}), 404
        
        name = row[0]
        leetcode_ids = json.loads(row[1]) if row[1] else []
        
        weak_topics = []
        total_solved = 0
        
        for username in leetcode_ids[:1]:
            data = fetch_leetcode_data(username)
            if 'error' not in data:
                stats = data.get('difficulty', {})
                total_solved = stats.get('Easy', 0) + stats.get('Medium', 0) + stats.get('Hard', 0)
                topics = data.get('topics', [])
                weak_topics = [t['tagName'] for t in topics if t.get('problemsSolved', 0) < 5]
        
        recommendations = []
        
        if total_solved < 20:
            recommendations.append({
                'category': 'Getting Started',
                'icon': '🚀',
                'suggestions': [
                    'Focus on Easy problems to build confidence',
                    'Solve array and string problems first',
                    'Practice 2-3 problems daily'
                ]
            })
        elif total_solved < 50:
            recommendations.append({
                'category': 'Building Momentum',
                'icon': '📈',
                'suggestions': [
                    'Mix easy and medium problems (60:40 ratio)',
                    'Start learning common patterns (Two Pointers, Sliding Window)',
                    'Review solutions after attempting'
                ]
            })
        else:
            recommendations.append({
                'category': 'Advanced Growth',
                'icon': '🎯',
                'suggestions': [
                    'Tackle more Hard problems',
                    'Participate in weekly contests',
                    'Focus on optimization and time complexity'
                ]
            })
        
        if weak_topics:
            recommendations.append({
                'category': 'Topics to Focus',
                'icon': '📖',
                'suggestions': [f'Practice more {topic} problems' for topic in weak_topics[:3]]
            })
        
        recommendations.append({
            'category': 'Study Plan',
            'icon': '📅',
            'suggestions': [
                'Solve 1 problem daily',
                'Revise concepts every weekend',
                'Join study groups for discussion'
            ]
        })
        
        return jsonify({
            'student_name': name,
            'roll': roll,
            'total_solved': total_solved,
            'weak_topics': weak_topics,
            'recommendations': recommendations,
            'success': True
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    """AI chat assistant for queries about students"""
    try:
        data = request.json
        query = data.get('query', '').lower()
        
        if not query:
            return jsonify({'error': 'No query provided'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students')
        rows = c.fetchall()
        conn.close()
        
        student_data = []
        for row in rows[:10]:
            leetcode_ids = json.loads(row[2]) if row[2] else []
            student_data.append({
                'roll': row[0],
                'name': row[1],
                'leetcode_ids': leetcode_ids
            })
        
        response = ""
        
        if 'top' in query or 'leader' in query or 'best' in query:
            response = "🏆 Top Performers:\n"
            response += "Use the Leaderboard view to see complete rankings!"
            
        elif 'weak' in query or 'struggling' in query:
            response = "📊 Students who may need support:\n"
            response += "Check the Batch Analytics for detailed insights!"
            
        elif 'total' in query or 'count' in query:
            response = f"📈 Total students enrolled: {len(student_data)}\n"
            response += "Use the Students tab to see all details."
            
        elif 'recommend' in query or 'suggest' in query:
            response = "💡 I recommend:\n"
            response += "• Practice daily\n"
            response += "• Focus on weak topics\n"
            response += "• Review solved problems\n"
            response += "• Join coding contests"
            
        elif 'hello' in query or 'hi' in query:
            response = "👋 Hello! I'm your AI assistant. Ask me about:\n"
            response += "• Top performers\n"
            response += "• Student statistics\n"
            response += "• Study recommendations\n"
            response += "• Performance insights"
            
        else:
            response = "🤖 I can help you with:\n"
            response += "• Finding top performers\n"
            response += "• Identifying struggling students\n"
            response += "• Getting study recommendations\n"
            response += "• Batch statistics\n\n"
            response += "Try asking: 'Show me top students' or 'Who needs help?'"
        
        return jsonify({
            'query': query,
            'response': response,
            'success': True
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/predict-performance')
def predict_performance():
    """Predict future performance trends"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT roll, name, leetcode_ids FROM students')
        rows = c.fetchall()
        conn.close()
        
        predictions = []
        
        for row in rows[:10]:
            roll = row[0]
            name = row[1]
            leetcode_ids = json.loads(row[2]) if row[2] else []
            
            easy, medium, hard = 0, 0, 0
            for username in leetcode_ids[:1]:
                data = fetch_leetcode_data(username)
                if 'error' not in data:
                    stats = data.get('difficulty', {})
                    easy = stats.get('Easy', 0)
                    medium = stats.get('Medium', 0)
                    hard = stats.get('Hard', 0)
            
            current_total = easy + medium + hard
            
            weekly_growth = 2
            predicted_1month = current_total + (weekly_growth * 4)
            predicted_3months = current_total + (weekly_growth * 12)
            
            performance_tier = "Beginner"
            if current_total > 100:
                performance_tier = "Expert"
            elif current_total > 50:
                performance_tier = "Intermediate"
            elif current_total > 20:
                performance_tier = "Advanced Beginner"
            
            predictions.append({
                'name': name,
                'roll': roll,
                'current_total': current_total,
                'predicted_1month': predicted_1month,
                'predicted_3months': predicted_3months,
                'performance_tier': performance_tier,
                'growth_potential': 'High' if current_total < 30 else 'Medium' if current_total < 80 else 'Low'
            })
        
        predictions.sort(key=lambda x: x['current_total'], reverse=True)
        
        return jsonify({
            'predictions': predictions,
            'insight': 'Based on current pace, students are projected to solve 8-10 problems per month.',
            'success': True
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===============================
# 🚀 RUN SERVER
# ===============================
if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 LeetCode Tracker Starting...")
    print("="*50)
    
    init_db()
    
    print(f"\n📂 Checking for {EXCEL_FILE}...")
    if os.path.exists(EXCEL_FILE):
        if PANDAS_AVAILABLE:
            load_excel_to_db()
        else:
            print(f"⚠️ {EXCEL_FILE} found but pandas not available")
            print(f"   Install pandas or add students manually through the UI")
    else:
        print(f"⚠️ {EXCEL_FILE} not found!")
        print(f"   You can add students manually through the UI")
    
    print("\n" + "="*50)
    print("🌐 Server: http://127.0.0.1:5000")
    print("="*50 + "\n")
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)