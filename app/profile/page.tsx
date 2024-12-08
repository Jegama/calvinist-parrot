// app/profile/page.tsx

"use client";

import { useEffect, useState } from "react";
import { account, databases } from "@/utils/appwrite";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Query } from "appwrite";

type User = {
  $id: string;
  name: string;
  email: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [chatCount, setChatCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchUserAndChats = async () => {
      try {
        // 1. Get the user
        const currentUser = await account.get();
        setUser(currentUser);

        // 2. If user is fetched, get their chats
        const response = await databases.listDocuments(
          process.env.NEXT_PUBLIC_DATABASE_ID_PARROT_CHAT!,
          process.env.NEXT_PUBLIC_COLLECTION_ID_MAIN_CHAT!,
          [
            Query.equal("userId", currentUser.$id) // Make sure your collection has a field "userId"
          ]
        );

        setChatCount(response.total); // total number of documents returned
      } catch (error) {
        console.error("Error fetching profile info:", error);
      }
    };

    fetchUserAndChats();
  }, []);

  if (!user) {
    return (
      <Card className="mx-auto max-w-sm mt-10">
        <CardHeader>
          <CardTitle>Please log in</CardTitle>
        </CardHeader>
        <CardContent>
          <p>You must be logged in to view your profile.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-sm mt-10">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Name: {user.name}</p>
        <p>Email: {user.email}</p>
        {chatCount !== null && <p>Number of chats: {chatCount}</p>}
      </CardContent>
    </Card>
  );
}
