// graphql/schema.js
import { buildSchema } from 'graphql';

export default buildSchema(`
  """A single journal entry"""
  type Entry {
    _id         : ID!
    userId      : ID!
    date        : String!
    section     : String!
    content     : String!
    tags        : [String]
    mood        : String
    linkedGoal  : ID
    cluster     : String
    createdAt   : String!
    updatedAt   : String!
  }

  """Metadata extracted from an Entry (task, appointment, etc.)"""
  type Ripple {
    _id            : ID!
    userId         : ID!
    sourceEntryId  : ID!
    entryDate      : String!
    extractedText  : String!
    originalContext: String!
    type           : String!
    priority       : String
    timeSensitivity: String
    contexts       : [String]
    confidence     : Float
    status         : String
    assignedCluster: String
    createdAt      : String!
    updatedAt      : String!
  }

  """Return shape when we also want ripples"""
  type EntryWithRipples {
    entry   : Entry!
    ripples : [Ripple!]!
  }

  input EntryInput {
    date       : String!
    section    : String!
    content    : String!
    tags       : [String]
    mood       : String
    linkedGoal : ID
    cluster    : String
  }

  type Query {
    entries(section: String, date: String): [Entry!]!
  }

  type Mutation {
    createEntry(input: EntryInput!): EntryWithRipples!
    updateEntry(id: ID!, input: EntryInput!): EntryWithRipples!
  }
`);
