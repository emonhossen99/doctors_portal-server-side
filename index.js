const express = require('express');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const cors = require('cors');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');

// middleWare
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.no7tlsb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function veryFlyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {

        return res.status(401).send({ massage: 'UnAuthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_SECRET_KEY, function (err, decoded) {
        if (err) {
            return res.status(403).send({ massage: 'Forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}

var sendEmailOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}
const mailer = nodemailer.createTransport(sgTransport(sendEmailOptions));

function sendAppointmentEmail(booking) {
    const { patient, patientName, date, treatment, slot } = booking;
    console.log(patient);
    var email = {
        to: process.env.EMAIL_SENDER,
        from: patient,
        subject: `Your Appointment For ${treatment} is on ${date}at ${slot} a confirmed `,
        text: `Your Appointment For ${treatment} is on ${date}at ${slot} a confirmed `,
        html: `
        <div>
        <p>Hello ${patientName}</p>,
        <h3>Your Appointment For ${treatment} is confirmed</h3>
        <p>Looking Forward to seeing you on ${date} at ${slot}</p>

        <h3>Our Address</h3>
        <p>Naldanga,Natore,Rajshahi</p>
        <p>Bangladesh</p>
        <a href="https://elaptopbd.web.app/">Subscribe</a>
        </div>
        `
    };
    mailer.sendMail(email, function (err, res) {
        if (err) {
            console.log(err)
        }
        else {
            console.log('success', res);
            console.log(res);
        }
    });

}

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("doctor-portal").collection("services")
        const bookingCollection = client.db("doctor-portal").collection("bookings")
        const userCollection = client.db("doctor-portal").collection("users")
        const doctorCollection = client.db("doctor-portal").collection("doctors")

        const veryFlyAdmit = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admit') {
                next()
            }
            else {
                res.status(403).send({ massage: 'Forbidden access' })
            }
        }

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const result = await cursor.toArray()
            res.send(result)

        })
        app.get('/users', veryFlyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date

            //step 1 :  all services collection get and convert to array
            const services = await serviceCollection.find().toArray
                ()
            //step 2 :  only single day bookings on this user 
            const query = { date: date }
            const booking = await bookingCollection.find(query).toArray()

            //step 3 : step  1 - step 2 
            services.forEach(service => {
                const servicesBookings = booking.filter(b => b.treatment === service.name)
                const booked = servicesBookings.map(s => s.slot)
                const available = service.slots.filter(s => !booked.includes(s))
                service.slots = available;
            })
            res.send(services)
        });
        app.put('/user/admit/:email', veryFlyJWT, veryFlyAdmit, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admit' },
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send({ result })

        });

        app.get('/admit/:email', veryFlyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmit = user.role === 'admit'
            res.send({ admit: isAdmit })
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const option = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, option)
            const token = jwt.sign({ email: email }, process.env.ACCESS_SECRET_KEY, { expiresIn: '1d' })
            res.send({ result, token })
        })

        app.get('/booking', veryFlyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await bookingCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ massage: 'Forbidden access' })
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            sendAppointmentEmail(booking)
            res.send({ success: true, result })
        })
        app.get('/doctors', veryFlyJWT, veryFlyAdmit, async (req, res) => {
            const doctor = await doctorCollection.find().toArray()
            res.send(doctor)
        })
        app.post('/doctor', veryFlyJWT, veryFlyAdmit, async (req, res) => {
            const doctor = req.body
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        });

        app.delete('/doctor/:email', veryFlyJWT, veryFlyAdmit, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
        })
    }
    finally {

    }
}
run().catch(console.dir)



app.get('/', (req, res) => {
    res.send('server is running')
})

app.listen(port, () => {
    console.log(port);
})