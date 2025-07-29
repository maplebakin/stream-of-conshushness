import { buildSchema } from 'graphql';

const schema = buildSchema(`
  type Entry {
    _id: ID!
    userId: ID!
    date: String!
    section: String!
    tags: [String]
    content: String!
  }

  input EntryInput {
    date: String!
    section: String!
    tags: [String]
    content: String!
  }

  type Query {
    entries(section: String, date: String): [Entry]
  }

  type Mutation {
    createEntry(input: EntryInput): Entry
  }
`);

export default schema;
