<div align="center">
	<img src="./public/LogoForHeader.png" alt="Calvinist Parrot" height="140" />
</div>

# Calvinist Parrot

An AI-powered theological assistant – merging centuries-old Reformed wisdom with modern machine intelligence.

[**Website**](https://www.calvinistparrot.com/)

This work is part of the [Calvinist Parrot Ministries](https://www.calvinistparrotministries.org/), we exist to glorify God by creating and freely distributing AI tools that proclaim the Gospel, strengthen the Church, and equip believers across the globe.

## Overview

Calvinist Parrot delivers Biblical insights and deep theological responses by combining multiple AI agents and a built-in review process modeled after Reformed theology. Whether you're exploring doctrine, engaging in a dynamic chat, or seeking daily devotionals, the Parrot is here to guide you.

## What the Parrot Can Do

- **Real-Time Chat:** Engage in interactive sessions with streamed responses.
<!-- - **Theological Q&A:** Answers complex theological questions with layered reasoning. -->
- **Multi-Perspective Insights:** Choose from Reformed Baptist, Presbyterian, Wesleyan, Lutheran, Anglican, Pentecostal/Charismatic, or Non-Denominational Evangelical modes.
- **Daily Devotionals:** Get devotionals generated from current news and Scripture.
- **Prayer Tracker:** Organize your prayer life with rotating prayer assignments, personal and family prayer requests, and prayer journals—designed to help you pray consistently for your household and broader faith community.
- **Church Finder:** Discover biblically sound churches with AI-powered doctrinal evaluations. Each church is analyzed for adherence to essential Christian doctrines, historic Reformed confessions, and theological soundness to help you find a faithful congregation.

## Getting Started

### Prerequisites
- Node.js 18.18.0 or higher
- npm
- Git

### Environment Setup

1. **Fork this repository**

- Click the "Fork" button in the top right
- Follow the prompts to create your fork

2. **Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/calvinist-parrot.git
cd calvinist-parrot
```

3. **Install dependencies**

```bash
npm install
```

4. **Environment variables**

* Copy `.env.template` to `.env`
* Fill in required credentials and API keys

5. **Run the development server**

```bash
npm run dev
```

## API Endpoints

### Core Features

- **/api/parrot-qa**  
  Processes user questions through categorization, multiple agent responses, and synthesizes a final answer.

- **/api/parrot-chat**  
  Handles real-time chat sessions, streaming responses and saving conversation history.

<!-- - **/api/elaborate**  
  Provides follow-up detailed responses (elaboration) based on initial answers and commentary.

- **/api/devotional-generation**  
  Generates daily devotionals by combining news snippets with Scripture in a structured JSON format. -->

### Church Finder

- **/api/churches**  
  List and create churches with AI-powered doctrinal evaluation (GET/POST).

- **/api/churches/[id]**  
  Retrieve detailed church information including evaluation history.

- **/api/churches/check**  
  Verify if a church already exists in the database by website URL.

- **/api/churches/meta**  
  Get filter metadata (states, denominations, totals) for church discovery.

## Contributing
We welcome contributions! Please see our Contributing Guide for details.

## Acknowledgements
Huge thanks to [AO Lab](https://helloaolab.my.canva.site/) for providing the Bible API with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and Bible Commentaries.

If you want to learn the legal restrictions to sharing God's word, click [here](https://copy.church/initiatives/bibles/).

## Contact
For questions or support, please [reach out](mailto:contact@calvinistparrotministries.org).

# Soli Deo Gloria

**"For from Him and through Him and to Him are all things. To Him be the glory forever! Amen."**
- Romans 11:36

<div align="center">
  <a href="https://copy.church/explain/importance/">
    <img src="https://copy.church/badges/lcc_alt_pde.png" alt="Copy.church" height="100" />
  </a>
  <a href="https://sellingJesus.org/free">
    <img src="https://copy.church/badges/sj_standard_pd.png" alt="sellingJesus.org/free" height="100" />
  </a>
</div>