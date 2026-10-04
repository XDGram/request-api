# Role-Based Job Referral API

A REST backend for a job-referral platform with two roles: **Company** and **Referrer**.

Companies can create and update their own job listings and view referrals submitted to jobs they own. Referrers can browse jobs and submit candidates. Authentication uses JWTs, passwords are hashed with bcrypt, and role/ownership checks prevent users from accessing actions outside their permissions.

## Stack

Node.js, Express, SQLite (`better-sqlite3`), JSON Web Tokens, bcrypt.

## Run

```bash
npm install
```

Copy `.env.example` to `.env`, set a strong `JWT_SECRET`, then:

```bash
npm start
```

The API runs at `http://localhost:3000`. `GET /health` can be used as a health check.

## Demo users

The database seeds two accounts on first run. Both use password `Password123!`:

- Company: `company@example.com`
- Referrer: `referrer@example.com`

Login through `POST /auth/login` and send the returned JWT as `Authorization: Bearer <token>` on protected requests.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| GET | `/jobs` | Authenticated |
| GET | `/jobs/:id` | Authenticated |
| POST | `/jobs` | Company |
| PUT | `/jobs/:id` | Company that owns the job |
| POST | `/jobs/:jobId/referrals` | Referrer |
| GET | `/jobs/:jobId/referrals` | Company that owns the job |

### Create a job

```json
{
  "title": "Software Engineer",
  "description": "Build and maintain backend APIs",
  "location": "Remote"
}
```

### Submit a referral

```json
{
  "candidateName": "Jane Doe",
  "candidateEmail": "jane@example.com",
  "resumeUrl": "https://example.com/jane-resume.pdf",
  "message": "Strong backend candidate"
}
```

## Data model

`users` stores both roles. A Company user can own many `jobs`. A Referrer user can create many `referrals`. Every referral belongs to one job and one referrer. SQLite foreign keys enforce these relationships.

## Access control

All job/referral endpoints require authentication. Role middleware separates Company and Referrer actions. Ownership is checked independently so one Company cannot update another Company's job or view its referrals. The API validates required fields, email/URL formats, job state, and returns appropriate `400`, `401`, `403`, `404`, `409`, and `500` responses.
