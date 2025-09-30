import requests
import json

# Test the chat API with the updated script
try:
    # Create session
    session_response = requests.post('http://localhost:5000/api/chat/sessions', 
                                   json={'title': 'Debug Test 2'})
    print(f"Session created: {session_response.status_code}")
    
    if session_response.status_code == 200 or session_response.status_code == 201:
        session_data = session_response.json()
        session_id = session_data['id']
        print(f"Session ID: {session_id}")
        
        # Test with the better query first
        message_response = requests.post(f'http://localhost:5000/api/chat/sessions/{session_id}/messages',
                                       json={'role': 'user', 'content': 'grounding point debris'})
        print(f"Message sent: {message_response.status_code}")
        message_data = message_response.json()
        
        # Print AI response
        if 'aiMessage' in message_data:
            print(f"AI Response: {message_data['aiMessage']['content']}")
            sources = message_data['aiMessage'].get('sources', [])
            print(f"Sources: {len(sources)}")
            for source in sources:
                print(f"  - {source.get('paragraph', 'N/A')}: {source.get('text_preview', 'N/A')}")
        else:
            print(f"Full response: {json.dumps(message_data, indent=2)}")
    else:
        print(f"Failed to create session: {session_response.text}")
        
except Exception as e:
    print(f"Error: {e}")