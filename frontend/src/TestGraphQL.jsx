// src/TestGraphQL.jsx
import React, { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';

export default function TestGraphQL() {
  const { token } = useContext(AuthContext);

  async function fetchEntries() {
    const res = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `
          {
            entries {
              _id
              section
              content
            }
          }
        `,
      }),
    });

    const data = await res.json();
    console.log('✨ GraphQL response:', data);
  }

  return (
    <button onClick={fetchEntries}>
      Test GraphQL Fetch
    </button>
  );
}
