import streamlit as st
from PIL import Image

from parrot_toolkit.sql_models import ConversationHistory
from parrot_ai.core.prompts import PARROT_SYS_PROMPT_MAIN, PARROT_SYS_PROMPT_BRIEF, CALVIN_SYS_PROMPT_CHAT_MAIN, CALVIN_SYS_PROMPT_CHAT_BRIEF
from parrot_ai import chat_functions
from parrot_ai import ccel_index as ccel

parrot = Image.open("app/calvinist_parrot.ico")
calvin = Image.open("app/calvin.ico")

# Setting up the language
if 'language' not in st.session_state:
    if st.session_state['logged_in'] == False:
        if st.session_state['url'] == 'loro':
            st.session_state['language'] = 'Español'
        else:
            st.session_state['language'] = 'English'

if st.session_state['language'] in ['Español', 'Spanish']:
    from parrot_toolkit.spanish_text import *
else:
    from parrot_toolkit.english_text import *

# Update the status of the conversation
# Make sure that whatever changes you do here, you do it in load_selected_conversation as well
def update_status(msg):
    # Add the message to the conversation history
    st.session_state["parrot_messages"].append(msg)
    if msg['role'] == "parrot":
        st.session_state["parrot_conversation_history"].append({"role": "assistant", "content": msg["content"]}) 
        st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'/parrot/ {msg["content"]}'}) # If parrot is speaking, we need to tell Calvin that "user" is in reality another agent
    elif msg['role'] == "librarian":
        st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'/librarian/ {msg["content"]}'})
        st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'/librarian/ {msg["content"]}'})
    else:
        st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'/calvin/ {msg["content"]}'}) # If Calvin is speaking, we need to tell Parrot that "user" is in reality another agent
        st.session_state["calvin_conversation_history"].append({"role": "assistant", "content": msg["content"]})

# Load the selected conversation into the chat UI - Similar logic to update_status
# Make sure that whatever changes you do here, you do it in update_status as well
def load_selected_conversation():
    for msg in st.session_state["parrot_messages"]:
        if msg["role"] == "parrot":
            st.session_state["parrot_conversation_history"].append({"role": "assistant", "content": msg["content"]})
            st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'/parrot/ {msg["content"]}'})
        elif msg["role"] == "calvin":
            st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'/calvin/ {msg["content"]}'})
            st.session_state["calvin_conversation_history"].append({"role": "assistant", "content": msg["content"]})
        elif msg['role'] == "librarian":
            st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'/librarian/ {msg["content"]}'})
            st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'/librarian/ {msg["content"]}'})
        else:
            st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'{st.session_state["human"]} {msg["content"]}'})
            st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'{st.session_state["human"]} {msg["content"]}'})


# This is were the magic happens
def interactWithAgents(question):
    st.session_state["parrot_conversation_history"].append({"role": "user", "content": f'{st.session_state["human"]} - {question}'})
    st.session_state["calvin_conversation_history"].append({"role": "user", "content": f'{st.session_state["human"]} - {question}'})
    
    # Get the response from the Parrot
    with st.chat_message("parrot", avatar=parrot):
        answer = ''
        c = st.empty()
        response = chat_functions.get_response(st.session_state["parrot_conversation_history"], stream=True)
        for event in response:
            c.write(answer)
            event_text = event.choices[0].delta.content
            if event_text is not None:
                answer += event_text

    # Add the response to the conversation history
    update_status({"role": "parrot", "content": answer})

    # Get the response from Calvin
    with st.chat_message("calvin", avatar=calvin):
        answer = ''
        c = st.empty()
        response = chat_functions.get_response(st.session_state["calvin_conversation_history"], stream=True)
        for event in response:
            c.write(answer)
            event_text = event.choices[0].delta.content
            if event_text is not None:
                answer += event_text

    # Add the response to the conversation history
    update_status({"role": "calvin", "content": answer})

    if st.session_state["parrot_type"] in ["Main", "Principal"]:
        # Get response from the Librarian
        librarian_message = ccel.generate_query_4_ccel_agent(st.session_state["parrot_messages"])
        with st.spinner("Consulting the Librarian..."):
            librarian_response = st.session_state["ccel_agent"].query(librarian_message)

        st.chat_message("CCEL Librarian", avatar="👨‍🏫").write(librarian_response.response)
        with st.expander(f"📚 **Counsulted Sources**"):
            consulted_sources = ccel.parse_source_nodes(librarian_response.source_nodes)
            ccel.display_consulted_sources(consulted_sources)

        update_status({"role": "librarian", "content": librarian_response.response, "consulted_sources": consulted_sources})

    # Get the response from the Parrot
    with st.chat_message("parrot", avatar=parrot):
        answer = ''
        c = st.empty()
        response = chat_functions.get_response(st.session_state["parrot_conversation_history"], stream=True)
        for event in response:
            c.write(answer)
            event_text = event.choices[0].delta.content
            if event_text is not None:
                answer += event_text

    # Add the response to the conversation history
    update_status({"role": "parrot", "content": answer})

    if st.session_state['logged_in']:
        # Generate a conversation name if it's a new conversation
        if st.session_state['new_conversation']:
            conversation_name = chat_functions.generate_conversation_name(st.session_state["parrot_messages"])
            if conversation_name:
                st.session_state['new_conversation'] = False
                st.session_state['conversation_name'] = conversation_name

        # Save conversation history 
        chat_functions.create_or_update_conversation(
            ConversationHistory, 
            st.session_state['user_id'], 
            st.session_state['conversation_name'], 
            st.session_state["parrot_messages"]
        )
    
    st.rerun()

# Reset the status of the conversation
def reset_status():
    st.session_state['new_conversation'] = True
    st.session_state["parrot_messages"] = [{"role": "parrot", "content": CHAT_FIRST_MESSAGE}] # What the user sees in the UI
    if st.session_state['parrot_type'] == 'Brief':
        st.session_state["parrot_conversation_history"] = [{"role": "system", "content": PARROT_SYS_PROMPT_BRIEF}] # What is send to the Parrot
        st.session_state["calvin_conversation_history"] = [{"role": "system", "content": CALVIN_SYS_PROMPT_CHAT_BRIEF}] # What is send to Calvin
    else:
        st.session_state["parrot_conversation_history"] = [{"role": "system", "content": PARROT_SYS_PROMPT_MAIN}] # What is send to the Parrot
        st.session_state["calvin_conversation_history"] = [{"role": "system", "content": CALVIN_SYS_PROMPT_CHAT_MAIN}] # What is send to Calvin
    st.session_state["ccel_agent"] = ccel.create_ccel_agent() # Erase the CCEL agent state
    st.rerun()
