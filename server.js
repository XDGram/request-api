require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db, initializeDatabase } = require("./database");

const app = express();
app.use(express.json());
initializeDatabase();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

const emailOK = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const urlOK = v => { try { new URL(v); return true; } catch { return false; } };
const tokenFor = u => jwt.sign({ id:u.id, email:u.email, role:u.role }, JWT_SECRET, { expiresIn:"1h" });

function authenticate(req,res,next) {
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
  try { req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Invalid or expired token"}); }
}
const requireRole = role => (req,res,next) => req.user.role===role ? next() : res.status(403).json({error:`${role} access required`});

app.get("/health",(req,res)=>res.json({status:"ok",service:"Job Referral API"}));

app.post("/auth/register",async(req,res)=>{
  try {
    const {name,email,password,role}=req.body;
    if(!name||!email||!password||!role) return res.status(400).json({error:"name, email, password and role are required"});
    if(!emailOK(email)||password.length<8||!["company","referrer"].includes(role)) return res.status(400).json({error:"Invalid registration data"});
    const normalized=email.toLowerCase().trim();
    if(db.prepare("SELECT id FROM users WHERE email=?").get(normalized)) return res.status(409).json({error:"Email already registered"});
    const hash=await bcrypt.hash(password,10);
    const result=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name.trim(),normalized,hash,role);
    const user={id:result.lastInsertRowid,name:name.trim(),email:normalized,role};
    res.status(201).json({message:"User registered successfully",user,token:tokenFor(user)});
  } catch(e) { console.error(e); res.status(500).json({error:"Internal server error"}); }
});

app.post("/auth/login",async(req,res)=>{
  try {
    const {email,password}=req.body;
    if(!email||!password) return res.status(400).json({error:"Email and password are required"});
    const user=db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase().trim());
    if(!user||!(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Invalid email or password"});
    res.json({message:"Login successful",user:{id:user.id,name:user.name,email:user.email,role:user.role},token:tokenFor(user)});
  } catch(e) { console.error(e); res.status(500).json({error:"Internal server error"}); }
});

app.get("/jobs",authenticate,(req,res)=>{
  const jobs=db.prepare(`SELECT jobs.*, users.name AS company_name FROM jobs JOIN users ON users.id=jobs.company_id ORDER BY jobs.created_at DESC`).all();
  res.json({count:jobs.length,jobs});
});

app.get("/jobs/:id",authenticate,(req,res)=>{
  const job=db.prepare(`SELECT jobs.*, users.name AS company_name FROM jobs JOIN users ON users.id=jobs.company_id WHERE jobs.id=?`).get(req.params.id);
  if(!job) return res.status(404).json({error:"Job not found"});
  res.json(job);
});

app.post("/jobs",authenticate,requireRole("company"),(req,res)=>{
  const {title,description,location}=req.body;
  if(!title||!description) return res.status(400).json({error:"title and description are required"});
  const result=db.prepare("INSERT INTO jobs(company_id,title,description,location) VALUES(?,?,?,?)").run(req.user.id,title.trim(),description.trim(),location||null);
  res.status(201).json({message:"Job created successfully",job:db.prepare("SELECT * FROM jobs WHERE id=?").get(result.lastInsertRowid)});
});

app.put("/jobs/:id",authenticate,requireRole("company"),(req,res)=>{
  const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.id);
  if(!job) return res.status(404).json({error:"Job not found"});
  if(job.company_id!==req.user.id) return res.status(403).json({error:"You can only update your own jobs"});
  const title=req.body.title??job.title, description=req.body.description??job.description, location=req.body.location??job.location, status=req.body.status??job.status;
  if(!["open","closed"].includes(status)) return res.status(400).json({error:"Status must be open or closed"});
  db.prepare("UPDATE jobs SET title=?,description=?,location=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title,description,location,status,job.id);
  res.json({message:"Job updated successfully",job:db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id)});
});

app.post("/jobs/:jobId/referrals",authenticate,requireRole("referrer"),(req,res)=>{
  const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.jobId);
  if(!job) return res.status(404).json({error:"Job not found"});
  if(job.status!=="open") return res.status(409).json({error:"Referrals cannot be submitted to a closed job"});
  const {candidateName,candidateEmail,resumeUrl,message}=req.body;
  if(!candidateName||!candidateEmail||!resumeUrl||!emailOK(candidateEmail)||!urlOK(resumeUrl)) return res.status(400).json({error:"Valid candidateName, candidateEmail and resumeUrl are required"});
  const result=db.prepare("INSERT INTO referrals(job_id,referrer_id,candidate_name,candidate_email,resume_url,message) VALUES(?,?,?,?,?,?)").run(job.id,req.user.id,candidateName.trim(),candidateEmail.toLowerCase().trim(),resumeUrl,message||null);
  res.status(201).json({message:"Referral submitted successfully",referral:db.prepare("SELECT * FROM referrals WHERE id=?").get(result.lastInsertRowid)});
});

app.get("/jobs/:jobId/referrals",authenticate,requireRole("company"),(req,res)=>{
  const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.jobId);
  if(!job) return res.status(404).json({error:"Job not found"});
  if(job.company_id!==req.user.id) return res.status(403).json({error:"You can only view referrals for your own jobs"});
  const referrals=db.prepare(`SELECT referrals.*, users.name AS referrer_name, users.email AS referrer_email FROM referrals JOIN users ON users.id=referrals.referrer_id WHERE job_id=? ORDER BY referrals.created_at DESC`).all(job.id);
  res.json({jobId:job.id,jobTitle:job.title,count:referrals.length,referrals});
});

app.use((req,res)=>res.status(404).json({error:"Route not found"}));
app.listen(PORT,()=>console.log(`Job Referral API running on http://localhost:${PORT}`));
