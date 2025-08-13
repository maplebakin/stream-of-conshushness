import { buildSchema } from 'graphql';

const schema = buildSchema(`
  """Status for suggested tasks created from entry analysis."""
  enum SuggestedTaskStatus {
    NEW
    ACCEPTED
    DISMISSED
  }

  type SuggestedTask {
    title: String!
    dueDate: String
    repeat: String
    cluster: String
    confidence: Float
    status: SuggestedTaskStatus!
  }

  enum EntrySort {
    DATE_ASC
    DATE_DESC
    CREATED_ASC
    CREATED_DESC
  }

  type Entry {
    _id: ID!
    userId: ID!
    date: String!
    text: String
    html: String
    content: String
    mood: String
    cluster: String
    section: String
    tags: [String]
    linkedGoal: ID
    suggestedTasks: [SuggestedTask]
    createdAt: String
    updatedAt: String
  }

  """Minimal Task shape (matches your Mongoose model fields we use)"""
  type Task {
    _id: ID!
    userId: ID!
    title: String!
    priority: String
    clusters: [String]
    dueDate: String
    repeat: String
    completed: Boolean
    sourceEntryId: ID
    sourceRippleId: ID
    createdAt: String
    updatedAt: String
  }

  """
  Backward-compatible input used for both create and update.
  All fields optional; server will default/merge intelligently.
  """
  input EntryInput {
    date: String
    section: String
    content: String
    text: String
    html: String
    tags: [String]
    mood: String
    linkedGoal: ID
    cluster: String
  }

  type Query {
    entry(id: ID!): Entry

    """
    Backward compatible: you can still call with just (section, date).
    You can also use the extra filters and pagination.
    """
    entries(
      section: String
      date: String
      cluster: String
      dateFrom: String
      dateTo: String
      tagIn: [String]
      q: String
      sort: EntrySort = DATE_DESC
      limit: Int = 50
      offset: Int = 0
    ): [Entry]
  }

  type Mutation {
    createEntry(input: EntryInput!): Entry!
    updateEntry(id: ID!, input: EntryInput!): Entry!
    deleteEntry(id: ID!): Boolean!

    """
    Promote one or more suggested tasks on an Entry into real Task docs.
    If indices is omitted or empty, promotes ALL with status NEW.
    """
    promoteSuggestedTasks(entryId: ID!, indices: [Int!]): [Task!]!
  }
    type EntryPreview {
  _id: ID!
  date: String!
  preview: String
}

extend type Task {
  entryCount: Int
  sourceEntry: EntryPreview
  linkedEntries: [EntryPreview!]
}

extend type Query {
  tasks(
    completed: Boolean
    cluster: String
    date: String
    includeEntries: Boolean = false
    limit: Int = 50
    offset: Int = 0
  ): [Task]
}

`);

export default schema;
