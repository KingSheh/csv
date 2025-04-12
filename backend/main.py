#Application Overview:
"""
Backend API built with FastAPI.
Allows users to upload bank transaction in CSV format, analyze the data using AI Powered Insights 
through LangChain and LangGraph, query the data using natural language questions

Processes bank records, creates statistical summaries, uses GPT 5 to answer questions
"""

#File, Class and Function Overview
"""

API Routes for transaction analysis service

Data Models using Pydantic and Typed Dict

Processing Utilities for CSV transaction data

AI Analysis Pipeline Using LangChain and LangGraph

Session Management for Handling Multiple Users
"""

#imports explained
"""
FastAPI Components: Builds API, file uploads, error handling, etc

Typing Utilities: For type annotations

Pydantic: For Data validation and serialization

Standard Python Libaries: For file handling, date processing, etc

Langchain and Langgrapg: AI analysis pipeline
"""

#FAST API CREATES core api application, used to instantiate the app object that defines all end points
#Upload File and File facilitate file uploads in /upload endpoint to recieve csv files from clients
#HTTP Exception: Provides a standard way to return HTTP Errors like 400 or 404 thrown in endpoints when errors occur
#Background Tasks: Enables schedules to run in background (such as cleanup or post-processing) not used in code rn
#Form Processes form data submitted in HTTP Requests, imported for potential future use not in code rn
#CORSMiddleWare - allow cross origin requests, configuraed bia app.add_middleware
#JSONResponse - provides custom JSON responses - 
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
#Provide type annotations to ensure clarity and correctness in code - used extensicely to annotate parameters and return types for example defining GraphState in lg pipeline
#Base model enables data validation and serialization of request/response bodies in Used to define models such as TransactionQuery, TransactionResponse, UploadResponse, AnalysisResponse, Session, and HelloWorldResponse.

from typing import List, Dict, Any, TypedDict, Optional, Union, Tuple
from pydantic import BaseModel

#Used to read and parse csv files - in parse_csv_file function
import csv
#Serialize and deserialize json - : Used to dump transactions to JSON files and to format data when sending it to the AI
import json


#interacting with OS
import os
from datetime import datetime
#Unique ids for session ids
import uuid
#simplifies dict operations by providing default values - used in create_transaction_summary 
from collections import defaultdict
#Why: Handles high-level file operations such as copying and deleting files or directories. Where: Used to copy the uploaded file in the /upload endpoint and to clean up session directories in the /delete_session endpoint.
import shutil
#Regular expressions for parsing
import re

from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from fastapi.security import APIKeyHeader
from fastapi import Depends, Security
from typing import List, Dict, Any, TypedDict, Optional, Union, Tuple
from pydantic import BaseModel
# Load environment variables
load_dotenv()
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


# Initialize FastAPI app
app = FastAPI(
    title="Transaction Analysis API",
    description="API for analyzing bank transaction data with AI",
    version="1.0.0",
    # Ensure Swagger UI and ReDoc are enabled
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://csv-frontend-wd3a.onrender.com",  # Your frontend URL
        "http://localhost:3000",  # For local development
        "http://127.0.0.1:3000",  # For local development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Directory for storing uploaded files and results
UPLOAD_DIR = "backend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Create a directory for temporary session data
SESSION_DIR = "backend/sessions"
os.makedirs(SESSION_DIR, exist_ok=True)


# Define state structure for LangGraph
"""
TypedDict is used mainly for static type checking. Tools like mypy or IDEs check that your dictionary uses the expected keys and value types. However, at runtime, a TypedDict is just a regular Python dictionary.


"""
class GraphState(TypedDict):
    transactions: List[Dict[str, Any]]
    transaction_summary: Dict[str, Any]
    query: str
    response: str


# Pydantic models for API requests and responses
class TransactionQuery(BaseModel):
    session_id: str
    query: str


class TransactionResponse(BaseModel):
    session_id: str
    response: str


class UploadResponse(BaseModel):
    session_id: str
    message: str
    transaction_count: int
    csv_format: str


class AnalysisResponse(BaseModel):
    session_id: str
    summary: Dict[str, Any]

class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: str

class Session(BaseModel):
    session_id: str
    file_path: str
    transactions: List[Dict[str, Any]]
    transaction_summary: Dict[str, Any]
    csv_format: str
    messages: List[Message] = []  # Add messages field with default empty list


class HelloWorldResponse(BaseModel):
    message: str
    status: str
    timestamp: str


# Store active sessions
active_sessions: Dict[str, Session] = {}


# Utility functions
def detect_csv_format(file_path: str) -> str:
    """
    Detect the format of the CSV file.
    
    Returns:
        str: 'simple' for basic format or 'desjardins' for Desjardins format
    """
    with open(file_path, 'r', newline='', encoding='utf-8') as csv_file:
        sample_content = csv_file.read(2000)  # Read first 2000 chars to detect format
        
        # Check for Desjardins format (contains "Desjardins Ontario" in quotes)
        if '"Desjardins Ontario"' in sample_content:
            return 'desjardins'
        
        # Check if this might be the simple format (mm/dd/yyyy date pattern at start of lines)
        if re.search(r'^\d{2}/\d{2}/\d{4}', sample_content, re.MULTILINE):
            return 'simple'
        
        # Default to simple if we can't determine
        return 'simple'


def parse_csv_file(file_path: str) -> Tuple[List[Dict[str, Any]], str]:
    """
    Parse a CSV file into a list of transaction dictionaries, handling different formats.
    
    Returns:
        Tuple containing:
        - List of transaction dictionaries
        - CSV format string ('simple' or 'desjardins')
    """
    transactions = []
    
    # Detect the CSV format
    csv_format = detect_csv_format(file_path)
    print(f"Detected CSV format: {csv_format}")
    
    if csv_format == 'simple':
        # Simple 5-column format (date, description, debit, credit, balance)
        with open(file_path, 'r', newline='', encoding='utf-8') as csv_file:
            reader = csv.reader(csv_file)
            
            for row in reader:
                if len(row) < 5 or not row[0].strip():  # Skip empty rows
                    continue
                
                # Typical structure: date, description, debit, credit, balance
                try:
                    date_str = row[0].strip()
                    description = row[1].strip()
                    
                    # Handle debit and credit columns - one should be empty
                    debit_str = row[2].strip()
                    credit_str = row[3].strip()
                    balance_str = row[4].strip()
                    
                    # Parse date to ISO format
                    try:
                        date = datetime.strptime(date_str, '%m/%d/%Y').isoformat()
                    except ValueError:
                        date = date_str
                    
                    # Parse numeric values, handling empty strings
                    debit = float(debit_str) if debit_str else 0.0
                    credit = float(credit_str) if credit_str else 0.0
                    balance = float(balance_str) if balance_str else 0.0
                    
                    # Create transaction object
                    transaction = {
                        "date": date,
                        "description": description,
                        "debit": debit,
                        "credit": credit,
                        "balance": balance
                    }
                    
                    transactions.append(transaction)
                except Exception as e:
                    print(f"Error parsing row in simple format: {row}. Error: {str(e)}")
                    continue
                
    elif csv_format == 'desjardins':
        # Desjardins format
        with open(file_path, 'r', newline='', encoding='utf-8') as csv_file:
            reader = csv.reader(csv_file, quotechar='"', delimiter=',')
            
            for row in reader:
                if not row or len(row) < 8:  # Skip rows without enough data
                    continue
                
                try:
                    # Extract fields from row
                    bank = row[0].strip() if len(row) > 0 else ""
                    date_str = row[3].strip() if len(row) > 3 else ""
                    transaction_id = row[4].strip() if len(row) > 4 else ""
                    description = row[5].strip() if len(row) > 5 else ""
                    
                    # Skip header or empty rows
                    if not date_str or date_str == "PCA" or bank == "":
                        continue
                    
                    # Get the last column for balance
                    balance_str = row[-1].strip()
                    balance = float(balance_str) if balance_str else 0.0
                    
                    # Find debit and credit amounts
                    debit = 0.0
                    credit = 0.0
                    
                    # In Desjardins format, the debit is usually column 7 and credit is column 8
                    # But we need to check which one has a value
                    if len(row) > 7 and row[7].strip():
                        debit_str = row[7].strip()
                        debit = float(debit_str) if debit_str else 0.0
                    
                    if len(row) > 8 and row[8].strip():
                        credit_str = row[8].strip()
                        credit = float(credit_str) if credit_str else 0.0
                    
                    # Parse date 
                    try:
                        if '/' in date_str:
                            date = datetime.strptime(date_str, '%Y/%m/%d').isoformat()
                        else:
                            date = date_str
                    except ValueError:
                        date = date_str
                    
                    # Create transaction object
                    transaction = {
                        "date": date,
                        "description": description,
                        "debit": debit,
                        "credit": credit,
                        "balance": balance,
                        "bank": bank,
                        "transaction_id": transaction_id
                    }
                    
                    transactions.append(transaction)
                except Exception as e:
                    print(f"Error parsing row in Desjardins format: {row}. Error: {str(e)}")
                    continue
    
    # Add debug output
    print(f"Parsed {len(transactions)} transactions")
    
    return transactions, csv_format


def create_transaction_summary(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create a summary of the transaction data."""
    if not transactions:
        return {}
    
    # Basic stats
    total_transactions = len(transactions)
    total_credits = sum(t["credit"] for t in transactions)
    total_debits = sum(t["debit"] for t in transactions)
    net_change = total_credits - total_debits
    
    # First and last transaction dates
    start_date = transactions[0]["date"]
    end_date = transactions[-1]["date"]
    
    # Monthly breakdown
    monthly_data = defaultdict(lambda: {"credits": 0, "debits": 0, "count": 0})
    
    for t in transactions:
        date_string = t["date"]
        month = None
        
        # Try to extract month from ISO format date
        if isinstance(date_string, str) and "T" in date_string:
            month = date_string[:7]  # Extract YYYY-MM from ISO format
        
        # If we couldn't extract month in standard way, try alternative formats
        if not month:
            try:
                if isinstance(date_string, str) and "/" in date_string:
                    # Try parsing as YYYY/MM/DD
                    parts = date_string.split('/')
                    if len(parts) == 3:
                        month = f"{parts[0]}-{parts[1]}"
            except:
                pass
        
        # If we have a month, add to the summary
        if month:
            monthly_data[month]["credits"] += t["credit"]
            monthly_data[month]["debits"] += t["debit"]
            monthly_data[month]["count"] += 1
    
    # Convert to regular dict
    monthly_summary = {
        month: {
            "credits": data["credits"],
            "debits": data["debits"],
            "net": data["credits"] - data["debits"],
            "count": data["count"]
        }
        for month, data in sorted(monthly_data.items())
    }
    
    # Most common descriptions
    description_counter = defaultdict(int)
    for t in transactions:
        description_counter[t["description"]] += 1
    
    common_descriptions = [
        {"description": desc, "count": count}
        for desc, count in sorted(description_counter.items(), key=lambda x: x[1], reverse=True)[:10]
    ]
    
    # Largest transactions
    largest_credits = sorted(transactions, key=lambda x: x["credit"], reverse=True)[:5]
    largest_debits = sorted(transactions, key=lambda x: x["debit"], reverse=True)[:5]
    
    return {
        "total_transactions": total_transactions,
        "total_credits": total_credits,
        "total_debits": total_debits,
        "net_change": net_change,
        "date_range": {
            "start": start_date,
            "end": end_date
        },
        "monthly_summary": monthly_summary,
        "common_descriptions": common_descriptions,
        "largest_credits": largest_credits,
        "largest_debits": largest_debits
    }


# Node functions for LangGraph
def process_csv(state: GraphState) -> GraphState:
    """
    Process the CSV data into transactions and summary.
    This assumes transactions are already loaded in the state.
    """
    # Create summary of transactions
    summary = create_transaction_summary(state["transactions"])
    
    return {
        **state,
        "transaction_summary": summary
    }


def analyze_with_llm(state: GraphState) -> GraphState:
    """
    Send transactions to LLM and get analysis based on the query.
    """
    if not state.get("transactions"):
        return {**state, "response": "No transactions to analyze."}
    
    # Initialize the LLM
    llm = ChatOpenAI(
        model="gpt-4-turbo",
        temperature=0
    )
    
    # Convert data to JSON strings
    transactions_json = json.dumps(state["transactions"], indent=2)
    summary_json = json.dumps(state["transaction_summary"], indent=2)
    
    # Create a prompt for the LLM
    system_prompt = """
    You are a financial analyst assistant. You will be given:
    1. A full list of banking transactions in JSON format
    2. A pre-computed summary of those transactions
    
    The transaction data includes dates, descriptions, debits (money out), credits (money in), and account balances.
    
    Your task is to analyze this data and provide insights based on the user's query.
    Be thorough but concise in your analysis, focusing on what the user is asking about.
    Use bullet points, tables, or other formatting to make your response clear and readable.
    
    Each transaction has this structure:
    {
      "date": "YYYY-MM-DDTHH:MM:SS", 
      "description": "Transaction description",
      "debit": amount_out (number),
      "credit": amount_in (number),
      "balance": account_balance (number)
    }
    
    The summary provides aggregated information about the transactions to help you
    understand the big picture without having to compute it yourself.
    
    Format your response in Markdown for better readability.
    """
    
    human_prompt = f"""
    Here is the user's query:
    {state["query"]}
    
    Here is a summary of the transaction data:
    ```json
    {summary_json}
    ```
    
    And here is the complete transaction data:
    ```json
    {transactions_json}
    ```
    
    Please analyze this data to answer the user's query.
    """
    
    # Get response from LLM
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt)
    ]
    
    response = llm.invoke(messages)
    
    return {**state, "response": response.content}


# Create the LangGraph
def create_analysis_graph():
    """Create and return the LangGraph for transaction analysis."""
    graph = StateGraph(GraphState)
    
    # Add nodes
    graph.add_node("process_csv", process_csv)
    graph.add_node("analyze", analyze_with_llm)
    
    # Add edges
    graph.add_edge("process_csv", "analyze")
    graph.add_edge("analyze", END)
    
    # Set entry point
    graph.set_entry_point("process_csv")
    
    # Compile the graph
    return graph.compile()


# Run the analysis graph with a query
def run_transaction_analysis(transactions: List[Dict[str, Any]], query: str) -> str:
    """Run the transaction analysis with the given data and query."""
    graph = create_analysis_graph()
    
    initial_state: GraphState = {
        "transactions": transactions,
        "transaction_summary": {},
        "query": query,
        "response": ""
    }
    
    final_state = graph.invoke(initial_state)
    
    return final_state["response"]


# API endpoints
@app.get("/", response_model=HelloWorldResponse)
async def hello_world():
    """Hello World endpoint to verify the API is working."""
    return HelloWorldResponse(
        message="Hello World! The Transaction Analysis API is up and running.",
        status="operational",
        timestamp=datetime.now().isoformat()
    )
@app.post("/set-api-key")
async def set_api_key(api_key: str = Form(...)):
    """
    Update the OpenAI API key.
    This would normally require authentication, but we're keeping it simple.
    """
    try:
        # In production, you should validate and store this more securely
        os.environ["OPENAI_API_KEY"] = api_key
        print(f"API key set: {api_key[:5]}...")
        return {"status": "success", "message": "API key updated successfully"}
    except Exception as e:
        print(f"Error setting API key: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error setting API key: {str(e)}")

@app.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """Upload a CSV file and create a new analysis session."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    # Create a unique session ID
    session_id = str(uuid.uuid4())
    session_path = os.path.join(SESSION_DIR, f"{session_id}")
    os.makedirs(session_path, exist_ok=True)
    
    # Save the uploaded file
    file_path = os.path.join(session_path, "transactions.csv")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Parse the CSV file
    try:
        transactions, csv_format = parse_csv_file(file_path)
        
        if not transactions:
            raise ValueError("No valid transactions found in the CSV file.")
        
        # Create transaction summary
        transaction_summary = create_transaction_summary(transactions)
        
        # Save transactions to JSON
        json_path = os.path.join(session_path, "transactions.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(transactions, f, indent=2)
        
        # Save session
        active_sessions[session_id] = Session(
            session_id=session_id,
            file_path=file_path,
            transactions=transactions,
            transaction_summary=transaction_summary,
            csv_format=csv_format
        )
        
        return UploadResponse(
            session_id=session_id,
            message=f"File uploaded and processed successfully (Format: {csv_format})",
            transaction_count=len(transactions),
            csv_format=csv_format
        )
    
    except Exception as e:
        # Clean up in case of failure
        shutil.rmtree(session_path, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@app.get("/transactions/{session_id}", response_model=List[Dict[str, Any]])
async def get_transactions(session_id: str):
    """Get all transactions for a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return active_sessions[session_id].transactions


@app.get("/summary/{session_id}", response_model=Dict[str, Any])
async def get_summary(session_id: str):
    """Get the summary for a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return active_sessions[session_id].transaction_summary


@app.post("/analyze", response_model=TransactionResponse)
async def analyze_transactions(query: TransactionQuery):
    """Analyze transactions based on a user query."""
    session_id = query.session_id
    
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if OpenAI API key is set - this is likely the issue
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=400, detail="OpenAI API key not set. Please set your API key.")
    
    session = active_sessions[session_id]
    
    try:
        # Store user message
        user_message = Message(
            role="user",
            content=query.query,
            timestamp=datetime.now().isoformat()
        )
        session.messages.append(user_message)
        
        # Run the analysis
        response = run_transaction_analysis(session.transactions, query.query)
        
        # Store assistant message
        assistant_message = Message(
            role="assistant",
            content=response,
            timestamp=datetime.now().isoformat()
        )
        session.messages.append(assistant_message)
        
        # Update session in active_sessions
        active_sessions[session_id] = session
        
        return TransactionResponse(
            session_id=session_id,
            response=response
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing transactions: {str(e)}")

# Add a new endpoint to get conversation history
@app.get("/messages/{session_id}", response_model=List[Message])
async def get_messages(session_id: str):
    """Get conversation history for a session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return active_sessions[session_id].messages


@app.get("/sessions", response_model=List[str])
async def list_sessions():
    """List all active session IDs."""
    return list(active_sessions.keys())


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its files."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Remove session files
    session_path = os.path.join(SESSION_DIR, f"{session_id}")
    shutil.rmtree(session_path, ignore_errors=True)
    
    # Remove from active sessions
    del active_sessions[session_id]
    
    return {"message": f"Session {session_id} deleted successfully"}


# Example query suggestions endpoint
@app.get("/query-suggestions", response_model=List[str])
async def get_query_suggestions():
    """Get a list of example query suggestions."""
    return [
        "What is the total amount of credits and debits in these transactions?",
        "What are the most common types of transactions?",
        "What's the pattern of account balance over time?",
        "Are there any unusual or large transactions I should be aware of?",
        "What's the monthly breakdown of income and expenses?",
        "Which months had the highest expenses?",
        "What were the largest transactions this year?",
        "How much did I spend on bank fees?"
    ]


# Test endpoint to check API without authentication
@app.get("/health")
async def health_check():
    """Check if the API is healthy."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "api_version": "1.0.0",
        "sessions_active": len(active_sessions)
    }


# Endpoint to get CSV format information
@app.get("/format/{session_id}")
async def get_csv_format(session_id: str):
    """Get information about the CSV format for a specific session."""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "format": active_sessions[session_id].csv_format,
        "transaction_count": len(active_sessions[session_id].transactions)
    }


# Startup event to load any existing sessions
@app.on_event("startup")
async def startup_event():
    print("🚀 Transaction Analysis API is starting up!")
    print("✅ Swagger documentation available at /docs")
    print("✅ ReDoc documentation available at /redoc")
    print("✅ Health check endpoint available at /health")
    print("✅ Hello World endpoint available at /")


# Shutdown event to clean up
@app.on_event("shutdown")
async def shutdown_event():
    print("👋 Transaction Analysis API is shutting down!")
    # Optional: Clean up temporary files or save state


if __name__ == "__main__":
    import uvicorn
    
    # Run the FastAPI app with uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)