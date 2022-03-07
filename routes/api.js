const express = require('express')
const router = express.Router()
const db = require('../models/doctor')
const { deleteOne } = require('../models/doctor');
const { json } = require('express/lib/response');
const res = require('express/lib/response');
const bcrypt = require('bcryptjs')
const moment = require('moment')
var _ = require('lodash');
const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId;

//Get all doctors
router.get('/doctors', async (req, res) => {
    try {
        const doctorlist = await db.user.aggregate([
            {
                $match: {
                    role: 'doctor'
                }
            },
            {
                $project: {
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    specialty: 1,
                }
            }
        ])
        res.json(doctorlist)

    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})
//get specific doctor
router.get('/doctors/:id', async (req, res) => {
    try {
        const [doctor] = await db.user.aggregate([
            {
                $match: {
                    $and: [
                        { role: 'doctor' },
                        { _id: ObjectId(req.params.id) }
                    ]
                }
            },
            {
                $project: {
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    specialty: 1,
                }
            }
        ])
        res.json(doctor)

    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

//check slots of specific doctor
router.get('/doctors/:doctorId/slots', async (req, res) => {
    try {
        const slots = await db.appointment.aggregate([
            {
                $match: {
                    $and: [
                        { "doctorId": req.params.doctorId },
                        { status: "active" }
                    ]
                }
            },
            {
                $project: {
                    patientId: 1,
                    startTime: 1,
                    endTime: 1,
                    status: 1
                }
            }
        ])
        res.json(slots)

    } catch (err) {
        res.status(500).json({ message: err.message })

    }

})

//Book Appointment 
router.post('/book/:patientID/:doctorID', async (req, res) => {
    try {
        const doctorId = req.params.doctorID
        const patientId = req.params.patientID
        const patient = await db.user.findById(patientId)
        const doctor = await db.user.findById(doctorId)
        const { startTime, endTime, note } = req.body
        if (!patient) {
            throw "Patient not found"
        } else if (!doctor) {
            throw "Doctor not found"
        }
        
        if(patient.role != 'patient'){
            throw "only patient is allowed to book an appointment"
        }

        const newDate = Date.now()
        const appointmentData = {
            patientId: patientId,
            doctorId: doctorId,
            startTime: startTime,
            endTime: endTime,
            createdAt: newDate,
            note: note,
            status: 'active'
        }
        var x = new moment(endTime)
        var y = new moment(startTime)
        var appointmentDuration = moment.duration(x.diff(y)).asMinutes();
        if (appointmentDuration <= 60) {
            const dateFrom = new Date(moment.utc(startTime).startOf('day').format())
            const dateTo = new Date(moment.utc(endTime).endOf("day").format())
            const slots = await db.appointment.aggregate([
                {
                    $match: {
                        $and: [
                            { "doctorId": doctorId },
                            { "status": "active" },
                            {
                                "startTime": {
                                    $gte: dateFrom,
                                    $lte: dateTo,
                                }
                            },
                            {
                                "endTime": {
                                    $gte: dateFrom,
                                    $lte: dateTo
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        startTime: 1,
                        endTime: 1
                    }
                }
            ])
            if (slots.length > 12) {
                throw "reached maximum appointment limit"
            }
            var tmp = appointmentDuration;
            slots.forEach(function (arrayItem) {
                var x = new moment(arrayItem.endTime)
                var y = new moment(arrayItem.startTime)
                var duration = moment.duration(x.diff(y)).asMinutes();
                tmp = tmp + duration;
            });
            if (tmp > 480) {
                throw "no slots available"
            } else {
                const slotAvailable = findSlot(startTime, slots)
                if (slotAvailable) {
                    const appointment = new db.appointment(appointmentData)
                    await appointment.save()
                    res.status(200).json(appointment)
                } else {
                    res.status(500).json({ message: "no slot available for appointment" })
                }
            }
        } else {
            res.status(500).json({ message: "can not book appointment more than 1 hr" })
        }
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

//helper function to find if a time slot is available
function findSlot(startTime, slots) {
    var busySlots = slots;
    var beginAt = startTime;
    var slotAvailable = true
    _.each(busySlots, slot => {
        var x = new moment(beginAt)
        var y = new moment(slot.startTime)
        var diff = moment.duration(x.diff(y)).asMinutes();
        if (diff === 0) {
            console.log("apointment already available for start time in db", slot)
            slotAvailable = false
            return false
        } else if (diff > 0) {
            var x = new moment(beginAt)
            var y = new moment(slot.endTime)
            var diff = moment.duration(x.diff(y)).asMinutes();
            if (diff < 0) {
                console.log("apointment already available for start time in db", slot)
                slotAvailable = false
                return false
            }
        }
    })
    return slotAvailable
}
//Cancel Appointment
router.patch('/cancel/:appointmentId', async (req, res) => {
    try {
        const appointment = await db.appointment.updateOne({ _id: ObjectId(req.params.appointmentId) }, {
            $set: {
                status: 'cancel'
            }
        })
        res.json(appointment)
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
})

//view appointment details
router.get('/appointmentDetails/:id', 
async (req, res) => {
    try {
        const [appointmentDetail] = await db.appointment.aggregate([
            {
                $match: {'_id':ObjectId(req.params.id)}
            },
            {
                $lookup: {
                    from: 'users',
                    let: { doctorId: { $toObjectId: "$doctorId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$doctorId"] } } },
                        {
                            $project: {
                                _id: "$_id",
                                name: { $concat: ['$firstName', ' ', '$lastName'] }
                            }
                        }
                    ],
                    as: 'doctor'
                }
            },
            { $unwind: '$doctor' },
            {
                $lookup: {
                    from: 'users',
                    let: { paitentId: { $toObjectId: "$patientId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$paitentId"] } } },
                        {
                            $project: {
                                _id: "$_id",
                                name: { $concat: ['$firstName', ' ', '$lastName'] }
                            }
                        }
                    ],
                    as: 'patient'
                }
            },
            { $unwind: '$patient' },
            {
                $project: {
                    doctorId: "$doctor._id",
                    doctorName: "$doctor.name",
                    patientId: "$patient._id",
                    patientName: "$patient.name",
                    startTime: 1,
                    endTime: 1,
                    note: 1
                }
            }
        ])
        res.json(appointmentDetail)

    } catch (err) {
        res.status(500).json({ message: err.message })

    }

})

//register a user
router.post('/register', register)

//verify registered user
router.post('/verify', verify)

//login registered and verified user 
router.post('/login', authenticate)

function register(req, res, next) {
    registerUser(req.body).then(() => res.json({ message: 'registration successful' })).catch(next)
}
async function registerUser(params) {
    const account = new db.user(params)
    account.verificationToken = randomTokenString()
    account.password = hash(params.password)
    account.createdAt = Date.now()
    await account.save(account)
}

/**
 * verify function to verify user verification
 * @param {*} req - 
 * @param {*} res - hjbj
 * @param {*} next - jkjkb
 */
function verify(req, res, next) {
    verifyUser(req.body).then(() => res.json({ message: 'verification successful' })).catch(next)
}

/**
 * 
 * @param {*} param0 
 */
async function verifyUser({ token }) {

    const account = await db.user.findOne({ verificationToken: token })
    if (!account) throw "verification failed"
    account.verificationToken = undefined
    await account.save()
}
function authenticate(req, res, next) {
    const { email, password } = req.body
    authenticateUser({ email, password }).then(() => res.json({ message: "login successful" })).catch(next)
}
async function authenticateUser({ email, password }) {
    const account = await db.user.findOne({ email: email })
    if (!account || account.verificationToken || !bcrypt.compareSync(password, account.password)) { throw "email or pass is incorrect" }

}
function randomTokenString() {
    return Math.random(30).toString().split('.')[1]
}
function hash(password) {
    return bcrypt.hashSync(password, 10)
}

module.exports = router