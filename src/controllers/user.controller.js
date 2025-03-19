import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import { uploadOnCoudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"



const registerUser = asyncHandler( async (req, res) => {
    
    // get user detail from frontend
    const {fullName, username, email, password} = req.body
    // console.log(email)

    // validation - not empty
    if(
          [fullName, email, username, password].some((field) => 
            field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    // check if user already exists: username or email
   const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if(existedUser) {
        throw new ApiError(409, "User With email or username already exists")
    }

    // check for avatar 
    const avatarLocalPath = req.files?.avatar[0]?.path
    if(!avatarLocalPath) throw new ApiError(400, "Avatar local image is required")
        // check for images
    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    
    console.log(avatarLocalPath)
    
    // upload them to cloudinary
    const avatar = await uploadOnCoudinary(avatarLocalPath)
    const coverImage = await uploadOnCoudinary(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(400, "Avatar image is required")
    }

    // create user object - create entry in db
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    // remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken "
    )

    // check for user creation
    if(!createdUser) throw new ApiError(500, "Something went wrong while creating the user")

    // return res 
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successsfully")
    )

})



export {registerUser}