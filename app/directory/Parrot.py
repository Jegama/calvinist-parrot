import streamlit as st
import parrot_toolkit.parrot_auth as auth
from parrot_toolkit.sql_models import ConversationHistory
from parrot_ai import chat_functions
from parrot_ai.v2_brain import interactWithAgents, reset_status
from parrot_ai.ccel_index import display_consulted_sources
from PIL import Image

parrot = Image.open("app/calvinist_parrot.ico")
calvin = Image.open("app/calvin.ico")

# Check if the user is logged in
if "logged_in" not in st.session_state:
    auth.check_login()

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

# Setting up the session state
if "page" not in st.session_state:
    st.session_state["page"] = pages[0]

if st.session_state["page"] != pages[0]:
    st.session_state["page"] = pages[0]
    reset_status()

# Sidebar
clear_button = st.sidebar.button(CLEAR_CHAT)
st.sidebar.divider()

if clear_button:
    reset_status()

# to show chat history on ui
if "parrot_messages" not in st.session_state:
    reset_status()

if st.session_state['logged_in']:
    st.sidebar.write(f"{LOGGED_AS} {st.session_state['username']}")

    if st.session_state["parrot_type"] in ["Main", "Principal"]:
        index_ = 0
        st.write(PARROT_MAIN_HEADER)
    else:
        index_ = 1
        st.write(PARROT_BRIEF_HEADER)

    parrot_type_dropdown = st.sidebar.radio(
        "Select Parrot Type", 
        options=chat_modes, 
        key="parrot_type_dropdown", 
        index=index_, 
    )

    if st.session_state["parrot_type"] != parrot_type_dropdown:
        st.session_state["parrot_type"] = parrot_type_dropdown
        reset_status()

    st.sidebar.subheader(CHAT_HIST)
    with st.container():
        chat_functions.load_conversation_history(
            ConversationHistory, 
            st.session_state['user_id'],
            'parrot_messages'
        )
else:
    st.write(PAROT_BRIEF_ONLY_HEADER)
    st.sidebar.write(NOT_LOGGED)

# Main content
for msg in st.session_state["parrot_messages"]:
    if msg["role"] == "parrot":
        avatar = parrot
    elif msg["role"] == "calvin":
        avatar = calvin
    elif msg["role"] == "librarian":
        avatar = "👨‍🏫"
    else:
        avatar = "🧑‍💻"
    st.chat_message(msg["role"], avatar=avatar).write(msg["content"])
    if "consulted_sources" in msg.keys():
        with st.expander(CONSULTED_SOURCES):
            display_consulted_sources(msg["consulted_sources"])

if prompt := st.chat_input(placeholder=CHAT_PLACESHOLDER):
    st.chat_message("user", avatar="🧑‍💻").write(prompt)
    st.session_state["parrot_messages"].append(
        {"role": "user", "avatar": "🧑‍💻", "content": prompt}
    )
    interactWithAgents(prompt)