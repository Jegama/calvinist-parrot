import streamlit as st
import parrot_ai.bible_commentaries as btk

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

clear_button = st.sidebar.button(CLEAR_CHAT)

st.sidebar.divider()
if "query_engine" not in st.session_state:
    st.session_state["query_engine"] = None

# to show chat history on ui
if "helper_messages" not in st.session_state:
    st.session_state["helper_messages"] = [{"role": "assistant", "content": SH_FIRST}]

if "check" not in st.session_state:
    st.session_state["check"] = None

if "page" not in st.session_state:
    st.session_state["page"] = pages[1]
if st.session_state["page"] != pages[1]:
    st.session_state["page"] = pages[1]
    st.session_state["helper_messages"] = [{"role": "assistant","content": SH_FIRST}]
    st.session_state["query_engine"] = None
    st.session_state["check"] = None

if clear_button:
    st.session_state["helper_messages"] = [{"role": "assistant", "content": SH_FIRST}]
    st.session_state["query_engine"] = None

for msg in st.session_state["helper_messages"]:
    avatar_ = "🧑‍💻" if msg["role"] == "user" else "🦉"
    st.chat_message(msg["role"], avatar=avatar_).write(msg["content"])
    if "sources" in msg.keys():
        with st.expander(SH_EXPANDER):
            for n, source in enumerate(msg["sources"]):
                st.write(f"  \n{SH_EXPANDER_SOURCE} {n+1}:  \n\t{source.text}")

prompt = st.chat_input(placeholder=SH_PLACEHOLDER if st.session_state["query_engine"] is not None else SH_PLACEHOLDER_VERSE)

if prompt:
    st.session_state["helper_messages"].append({"role": "user", "content": prompt})
    st.chat_message("user", avatar="🧑‍💻").write(prompt)

    if st.session_state["query_engine"] is None:
        with st.spinner(SH_SPINNER):
            st.session_state.check = btk.check_input(prompt)
        if st.session_state.check is None:
            st.chat_message("assistant", avatar="🦉").write(SH_CHECK_NONE)
            st.session_state["helper_messages"].append({"role": "assistant", "content": SH_CHECK_NONE})
        else:
            st.chat_message("assistant", avatar="🦉").write(st.session_state.check)
            with st.spinner(SH_CHECK_INDEXING):
                text_ref = st.session_state.check.split(" - ")[-1].replace("  \n\n", "")
                st.session_state["query_engine"] = btk.generate_query_index(text_ref)
            st.chat_message("assistant", avatar="🦉").write(SH_CHECK_SUCCESS)
            st.session_state["helper_messages"].append({"role": "assistant", "content": st.session_state.check})
            st.session_state["helper_messages"].append({"role": "assistant", "content": SH_CHECK_SUCCESS})
    else:
        with st.spinner(SH_SPINNER_QUERY):
            response = st.session_state["query_engine"].query(prompt)
        st.chat_message("assistant", avatar="🦉").write(response.response)
        with st.expander(SH_EXPANDER):
            for n, source in enumerate(response.source_nodes):
                st.write(f"  \n{SH_EXPANDER_SOURCE} {n+1}:  \n\t{source.text}")
        st.session_state["helper_messages"].append({"role": "assistant", "content": response.response, "sources": response.source_nodes})

    st.rerun()

if st.session_state["query_engine"] is None:
    st.sidebar.write(SH_NO_QUERY_ENGINE)
else:
    st.sidebar.write(f"{SH_YES_QUERY_ENGINE}  \n\n{st.session_state.check}")