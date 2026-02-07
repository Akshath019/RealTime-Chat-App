import { useState, useEffect } from "react";
import { nanoid } from "nanoid";

const ANIMALS = [
  "axolotl",
  "badger",
  "capybara",
  "dolphin",
  "eagle",
  "fox",
  "giraffe",
  "hamster",
  "iguana",
  "jaguar",
  "koala",
  "lemur",
  "moose",
  "narwhal",
  "octopus",
  "panda",
  "quokka",
  "raccoon",
  "sloth",
  "tiger",
];

const STORAGE_KEY = "chat_username";

const generateUserName = () => {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `anonymous-${word}-${nanoid(5)}`;
};

export const useUsername = () => {
  const [username, setUsername] = useState("");

  useEffect(() => {
    const main = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUsername(stored);
        return;
      }

      const generated = generateUserName();
      localStorage.setItem(STORAGE_KEY, generated);
      setUsername(generated);
    };

    main();
  }, []);

  return { username }
};
