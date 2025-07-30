import { buildSchema } from 'graphql';

const schema = buildSchema(`
type Entry {
  _id: ID!
  userId: ID!
  date: String!
  section: String!
  content: String!
  tags: [String]
  mood: String
  linkedGoal: ID
  cluster: ID
}


input EntryInput {
  date: String!
  section: String!
  content: String!
  tags: [String]
  mood: String
  linkedGoal: ID
  cluster: ID
}


  type Query {
    entries(section: String, date: String): [Entry]
  }

  type Mutation {
    createEntry(input: EntryInput): Entry
  }
`);

export default schema;
