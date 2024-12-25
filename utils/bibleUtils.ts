// utils/bibleUtils.ts

import { getBookId } from '@/utils/bookMappings';
import { TranslationBookChapter, ChapterVerse, VerseContent } from '@/types/bible';

export async function getBibleCommentary(
    commentaryId: string,
    book: string,
    chapter: number,
    verses?: number | number[]
  ): Promise<string> {
    console.log(`getBibleCommentary called with:`, { commentaryId, book, chapter, verses });
    try {
        const bookId = getBookId(book);
        const response = await fetch(`https://bible.helloao.org/api/c/${commentaryId}/${bookId}/${chapter}.json`);
        if (!response.ok) {
            console.error(`Error fetching commentary: ${response.statusText}`);
            return 'Error fetching commentary';
        }

        const data = await response.json();
        console.log(`Commentary data received:`, data);

        let commentaryText = '';

        if (data.chapter.introduction) {
            commentaryText += data.chapter.introduction + '\n\n';
        }

        const content = data.chapter.content;

        interface CommentaryVerseContent {
            type: 'verse';
            number: number;
            content: VerseContent[];
        }

        content.forEach((item: CommentaryVerseContent) => {
        if (item.type === 'verse') {
            const verseContent: string = item.content.map(extractText).join(' ');
            commentaryText += `${item.number}: ${verseContent}\n`;
        }
        });

        console.log(`Returning commentary text:`, commentaryText.substring(0, 100) + '...');
        return commentaryText;
    } catch (error) {
        console.error('Error in getBibleCommentary:', error);
        return 'Error loading commentary';
    }
}

function extractText(contentItem: VerseContent | string): string {
  if (typeof contentItem === 'string') {
    return contentItem;
  } else if ('text' in contentItem && contentItem.text) {
    return contentItem.text;
  } else if ('heading' in contentItem && contentItem.heading) {
    return contentItem.heading;
  } else if ('lineBreak' in contentItem && contentItem.lineBreak) {
    return '\n';
  } else {
    return '';
  }
}

export const bibleVerseRegex = /\b(?!In\b)(?:[1-3]\s)?(?!In\b)[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+\d+:\d+(?:-\d+)?\b/g;

export const extractReferences = (text: string): string[] => {
  const matches = text.match(bibleVerseRegex);
  return matches
    ? matches.map(ref => ref.trim().replace(/[.,;:]$/, ''))
    : [];
};

const testMarkdown = `
# Understanding the Third Commandment

All three answers correctly convey the essence of the third commandment, which teaches us to honor and respect God's name. Here are some key points to consider:

1. **Respect and Reverence**: It is important to speak about God with respect. We should not use His name lightly or in a disrespectful manner.
2. **Avoiding Misuse**: The commandment warns against using God's name in vain, which means we should not use it for trivial or sinful purposes.
3. **Holiness of God's Name**: God's name is holy, and we should treat it as such, using it only in ways that are true and good. Isaiah 29:13 says, "These people come near to me with their mouth and honor me with their lips, but their hearts are far from me. Their worship of me is based on merely human rules they have been taught."

## Reflection Questions

To reflect on these answers, consider these questions:

- How do we show respect for God's name in our daily conversations?
- Can you think of examples where God's name is misused in our culture today?
- What are some ways we can use God's name to praise and glorify Him? 

These reflections can help deepen your understanding of the commandment and its application in life. (Exodus 20:7; Matthew 5:34-37)

For further study, you might want to look at Psalm 8:1 and Philippians 2:9-11, which speak about the power and majesty of God's name.

Matthew Henry, in his commentary, highlights the significance of God's love, stating, "God is love" (1 John 4:8). This attribute is not merely a characteristic but the essence of God's being. His love is demonstrated through His actions, particularly in the sending of His Son, Jesus Christ, to die for humanity's sins (1 John 4:9-10). This sacrificial love reveals God's desire for reconciliation with His people, showcasing His mercy and grace. Henry notes that God's love is "the fountain, author, parent, and commander of love," indicating that true love originates from God and is reflected in the lives of those who know Him.

Moreover, God's sovereignty is a crucial aspect of His character. Psalm 103:19 states, "The Lord has established his throne in heaven, and his kingdom rules over all." This sovereignty means that God is in control of all creation, orchestrating events according to His divine will. It reassures believers that nothing happens outside of His knowledge or authority. Matthew Henry emphasizes that God's governance is not arbitrary; rather, it is rooted in His wisdom and righteousness. He governs with a purpose, ensuring that His plans for humanity unfold in accordance with His perfect will.

God's holiness is another vital attribute that shapes our understanding of Him. Holiness signifies God's purity and separation from sin. In Isaiah 6:3, the seraphim proclaim, "Holy, holy, holy is the Lord Almighty; the whole earth is full of his glory." This declaration underscores the reverence and awe that God commands. Henry explains that God's holiness is the foundation of His justice, meaning that He cannot overlook sin. However, His justice is tempered by His mercy, allowing for forgiveness through faith in Christ.
`;