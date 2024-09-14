import streamlit as st
from PIL import Image
import parrot_toolkit.parrot_auth as auth

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


parrot = Image.open("app/dall_e_s_parrot.png")

st.title(ABOUT_TITLE)

col1, col2 = st.columns([1,1])

with col1:
    st.image(parrot)

st.write(ABOUT_INTRO)

st.divider()

st.write(ABOUT_MENU_INTRO)

st.divider()

st.markdown(ABOUT_FOOTER, unsafe_allow_html=True)