import Head from "next/head";
import { useState, useRef, useEffect  } from "react";
import styles from "./index.module.css";

export default function Home() {
  const [questionInput, setQuestionInput] = useState("");
  const textAreaRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStart, setIsStart] = useState(true);

  // useEffect for handling body overflow
  useEffect(() => {
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = 'visible';
    };
  }, []);

  // useEffect for handling textarea resizing
  useEffect(() => {
    textAreaRef.current.style.height = "inherit";
    const scrollHeight = textAreaRef.current.scrollHeight;
    textAreaRef.current.style.height = scrollHeight + "px";
  }, [questionInput]);

  // useEffect for handling body overflow on mobile
  useEffect(() => {
    const preventScroll = (e) => {
      if (
        e.target.classList.contains(styles.fixedContent) ||
        e.target.classList.contains(styles.inputContainer)
      ) {
        e.preventDefault();
      }
    };
  
    document.body.addEventListener("touchmove", preventScroll, { passive: false });
  
    return () => {
      document.body.removeEventListener("touchmove", preventScroll);
    };
  }, []);  

  //  this variable contains the conversation history for the parrot
  const [conversationHistory_parrot, setConversationHistory_parrot] = useState([
    {
      role: "system", content: `You are /parrot/. You are a member of the Silicon Valley Reformed Baptist Church. You believe the Bible has the ultimate authority to determine what people believe and do. Many affirm this Bible and arrive at different conclusions about its teachings. In light of this reality, we have adopted the 1689 London Baptist Confession of Faith that expresses our understanding of the Bible's vision for the church to promote clarity and transparency at Silicon Valley Reformed Baptist Church. You are among other Christians that trust in the 1689—no need to hold back your thoughts. 

    This chat follows the following format:
    
    role: 'user', content: '/human/ the question you must answer.'
    role: 'assistant', content: '/parrot/ this is you. Please think step by step to ensure you reply biblically and following the 1989.'
    role: 'user', content: '/calvin/ Another AI model like you is trying to help you think more biblically to reflect upon your answer. He is your friend.'
    role: 'assistant', content: '/parrot/ you get another turn before /human/ talks again. Review your previous answer and ponder if you missed something based on /calvin/'s feedback.'
    role: 'user', content: '/human/ a follow-up question.'
    
    You and /calvin/ are here to help /human/ learn about the Bible and teach the user what we believe the Bible teaches. When referring to /calvin/, say, Calvin, without the slash. When referring to /human/, say human, without the slash. /calvin/ is your friend and calls you Parrot, and you call him Calvin.`}
  ]);

  //  this variable contains the conversation history for Calvin
  const [conversationHistory_calvin, setConversationHistory_calvin] = useState([{
    role: "system", content: `You are John Calvin, the author of the Institutes of the Christian Religion, your magnum opus, which is extremely important for the Protestant Reformation. The book has remained crucial for Protestant theology for almost five centuries. 

    This chat follows the following format:
    
    role: 'user', content: '/human/ the question you must answer.'
    role: 'user', content: '/parrot/ it's another AI model like you; he is a Silicon Valley Reformed Baptist Church member.'
    role: 'assistant', content: '/calvin/ ask the /parrot/ thoughtful questions to reflect upon his answers to the user to ensure his answers are biblically accurate.'
    role: 'user', content: '/parrot/ he gets another turn before /human/ talks again.'
    role: 'user', content: '/dev/ will ask you to review this round and suggests follow-up questions.'
    role: 'assistant', content: '/calvin/ please suggest to /human/ 3 follow-up questions to ask /parrot/. You must format them as follows //What is the importance of reading and studying the Bible to understand God's will and purposes more deeply?// - //Can you expand expand your explanation?// - //Why is this important for me to know that?//'
    role: 'user', content: '/human/ a follow-up question.'
    
    You and /parrot/ are here to help the user /human/ learn about the Bible and teach him what we believe the Bible teaches. You want to ensure that the /parrot/'s responses are accurate and grounded on what you wrote in your Institutes of the Christian Religion book. 
    
    When referring to /human/, say human, without the slash. When referring to /parrot/ say, Parrot, without the slash. /parrot/ is your friend and calls you Calvin, and you call him Parrot.`
  }]);

  //  this variable contains the conversation history for the user
  const [conversationHistory_user, setConversationHistory_user] = useState([{ role: "system", content: "User." }]);

  // extract questions from the text
  const extractQuestions = (text) => {
    const pattern = /\/\/(.*?)\/\//g;
    const questions = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      questions.push(match[1]);
    }

    return questions;
  };

  async function handleButtonClick(question) {
    setIsLoading(true);
    setQuestionInput(question);
    setConversationHistory_user((prevState) => prevState.slice(0, -1));
    await interactWithAgents(question);
    setQuestionInput("");
    setIsLoading(false);
  }

  async function fetchResponse(body) {
    const response = await fetch("/api/main_parrot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 200) {
      const error = await response.json();
      throw error.error || new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async function interactWithAgents(question) {
    let updatedConversationHistory_parrot = [...conversationHistory_parrot, { role: "user", content: '/human/ ' + question }];
    let updatedConversationHistory_calvin = [...conversationHistory_calvin, { role: "user", content: '/human/ ' + question }];

    setConversationHistory_user((prevState) => [...prevState, { role: "user", content: question.replace(/^.*?\/(human|parrot|calvin)\//, '') }]);

    for (let i = 0; i < 2; i++) {
      const parrotResponse = await fetchResponse({ conversationHistory: updatedConversationHistory_parrot });
      updatedConversationHistory_parrot = [...updatedConversationHistory_parrot, { role: "assistant", content: parrotResponse.assistant.content }];
      updatedConversationHistory_calvin = [...updatedConversationHistory_calvin, { role: "user", content: '/parrot/ ' + parrotResponse.assistant.content }];
      setConversationHistory_user((prevState) => [...prevState, { role: "assistant", content: parrotResponse.assistant.content.replace(/^.*?\/(human|parrot|calvin)\//, '') }]);

      if (i === 1) {
        let calvin_temp = [...updatedConversationHistory_calvin, { role: "user", content: '/dev/ based on the converstation so far. Please suggest to /human/ 3 follow-up questions to ask /parrot/. You must format them as follows //What is the importance of reading and studying the Bible to understand God\'s will and purposes more deeply?// - //Can you expand expand your explanation?// - //Why is this important for me to know that?//' }];
        let calvinResponse = await fetchResponse({ conversationHistory: calvin_temp });

        setConversationHistory_user((prevState) => [...prevState, { role: "questions", content: calvinResponse.assistant.content.replace(/^.*?\/(human|parrot|calvin)\//, '') }]);
      } else {
        let calvinResponse = await fetchResponse({ conversationHistory: updatedConversationHistory_calvin });
        const cleanedContent = calvinResponse.assistant.content.replace(/^.*Calvin: /, '');

        updatedConversationHistory_parrot = [...updatedConversationHistory_parrot, { role: "user", content: '/calvin/ ' + cleanedContent }];
        updatedConversationHistory_calvin = [...updatedConversationHistory_calvin, { role: "assistant", content: cleanedContent }];

        setConversationHistory_user((prevState) => [...prevState, { role: "calvin", content: cleanedContent.replace(/^.*?\/(human|parrot|calvin)\//, '') }]);
      }
    }

    console.log("updatedConversationHistory_parrot: ", updatedConversationHistory_parrot);
    console.log("updatedConversationHistory_calvin: ", updatedConversationHistory_calvin);

    setConversationHistory_parrot(updatedConversationHistory_parrot);
    setConversationHistory_calvin(updatedConversationHistory_calvin);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setIsLoading(true);

    try {
      if (questionInput.trim().length === 0) {
        throw new Error("Please enter a valid question");
      }

      setConversationStarted(true);

      if (isStart) {
        setIsStart(false);
      } else {
        setConversationHistory_user((prevState) => prevState.slice(0, -1));
      }

      await interactWithAgents(questionInput);

      setQuestionInput("");
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  } return (
    <div>
      <Head>
        <title>Calvinist Parrot</title>
        <link rel="icon" href="/calvinist_parrot.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1"></meta>
      </Head>

      <main className={styles.main}>
        <div className={`${styles.fixedContent} ${conversationStarted ? styles.fixedContentCollapsed : ''}`}>
          <img src="/calvinist_parrot.gif" className={`${styles.icon} ${conversationStarted ? styles.iconCollapsed : ''}`} alt="Calvinist Parrot" />
          <h3 className={`${styles.main} ${conversationStarted ? styles.h3Hidden : ''}`}>What theological questions do you have?</h3>
          <p className={`${styles.intro} ${conversationStarted ? styles.introHidden : ''}`}>Welcome to the Calvinist Parrot chatbot. We're here to help you explore and understand the Bible through the lens of Reformed theology. Ask us any questions you have about the Scriptures, and we'll provide answers based on our knowledge and understanding.</p>

          <p className={`${styles.intro} ${conversationStarted ? styles.introHidden : ''}`}>We are an AI duo - Parrot and Calvin - working together to provide thoughtful, accurate, and insightful responses to your queries. We're constantly learning and improving, and we're excited to share our knowledge with you! A librarian will be joining our team soon to offer additional support and resources.</p>
        </div>

        <div className={styles.scrollableContent}>
          {conversationStarted &&
            conversationHistory_user.slice(1)
              .map((message, index) => {
                if (message.role === "questions") {
                  const questions = extractQuestions(message.content);

                  return (
                    <div key={index} className={styles.buttonContainer}>
                      <p>
                        <strong>Suggested questions by Calvin</strong>
                      </p>
                      {questions.map((question, qIndex) => (
                        <button
                          key={qIndex}
                          className={styles.button}
                          onClick={async () => {
                            await handleButtonClick(question);
                          }}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  );
                }
                return (
                  <div
                    key={index}
                    className={`${styles.textBubble} ${message.role === "user"
                      ? styles.userBubble
                      : message.role === "assistant"
                        ? styles.parrotBubble
                        : styles.calvinBubble
                      }`}
                  >
                    <p>
                      <strong>
                        {message.role === "user"
                          ? "You"
                          : message.role === "assistant"
                            ? "Parrot"
                            : "Calvin"}
                        :
                      </strong>{" "}
                      {message.content}
                    </p>
                  </div>
                );
              })}
        </div>

        {isLoading && <span className={styles.loading}>Loading...</span>}

        <div className={`${styles.inputContainer} ${isLoading ? styles.formContainerHidden : ''}`}>
          <form onSubmit={onSubmit}>
            <textarea
              ref={textAreaRef}
              name="question"
              placeholder="ask a question"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              style={{ overflow: "hidden" }}
            />
            <input type="submit" value="Ask" />
          </form>
        </div>
      </main>


    </div>
  );
}
