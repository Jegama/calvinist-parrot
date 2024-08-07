import os, llama_index
from dotenv import load_dotenv
from langchain.agents import AgentExecutor
from langchain.chat_models import ChatOpenAI
from langchain.embeddings import OpenAIEmbeddings
from langchain.memory import ConversationBufferMemory
from langchain.memory.chat_message_histories import StreamlitChatMessageHistory
from llama_index import ServiceContext

from parrot_ai.ccelTools import toolkit
from CustomConversationalChatAgent import ConversationalChatAgent

load_dotenv()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
gpt_model = os.environ.get("GPT_MODEL")

llm = ChatOpenAI(
    model_name=gpt_model, 
    temperature=0,
)

llm_embeddings = OpenAIEmbeddings()

service_context = ServiceContext.from_defaults(
    llm=llm, embed_model=llm_embeddings
)

llama_index.set_global_service_context(service_context)

class CalvinistParrot():
    def create_agent(self):
        msgs = StreamlitChatMessageHistory()
        memory = ConversationBufferMemory(
            chat_memory=msgs, return_messages=True, memory_key="chat_history", output_key="output"
        )

        chat_agent = ConversationalChatAgent.from_llm_and_tools(llm=llm, tools=toolkit)

        executor = AgentExecutor.from_agent_and_tools(
            agent=chat_agent,
            tools=toolkit,
            memory=memory,
            return_intermediate_steps=True,
            handle_parsing_errors=True,
            verbose=True
        )
        return executor, msgs