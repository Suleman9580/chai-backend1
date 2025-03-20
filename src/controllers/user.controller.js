import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import { uploadOnCoudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import  jwt from "jsonwebtoken"
import { response } from "express"





const generateAccessAndRefereshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
    }
}

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

    
    // console.log(avatarLocalPath)
    
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

const loginUser = asyncHandler( async (req, res) => {
    // req.body -> data
    const {email, username, password} = req.body
    // console.log(email)

    ///username email present or not
    if(!username && !email){
        throw new ApiError(400, "Username or email is required")
    }

    // find the user
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if(!user) throw new ApiError(404, "User doesn't exists")

    // password check
    
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid) throw new ApiError(401, "Incorrect Password")

    //access and refresh token 
    const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id)

    //send cookies
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User Logged in successfully"
        )
    )

})

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
            {
                new: true
        }
        
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Log out successfully"))
    
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    // console.log(incomingRefreshToken)
    if(!incomingRefreshToken) throw new ApiError(401, "Unauthorized request")
    
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        
        const user = await User.findById(decodedToken?._id)
        
        if(!user) throw new ApiError(401, "Invalid refresh token")
    
        if(incomingRefreshToken !== user?.refreshToken) throw new ApiError(401, "refresh token is expired or used")
    
            const options = {
                httpOnly: true,
                secure: true
            }
    
           const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
        
           return res
           .status(200)
           .cookie("accessToken", accessToken, options)
           .cookie("refreshToken", newRefreshToken, options)
           .json(
            new ApiResponse(200, {accessToken, refreshToken: newRefreshToken},
            "Access Token refreshed successfully"
           ))
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token catch")
    }


})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect) throw new ApiError(400, "Invalid Old Password")

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Changed successfully"))

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All Fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user), "Account details updated successfully")
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath) throw new ApiError(400, "Avatar file is missing")

    const avatar = await uploadOnCoudinary(avatarLocalPath)

    if(!avatar.url) throw new ApiError(400, "Error while uploading avatar file")
    
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")


    return res
    .status(200)
    .json(new ApiResponse(200, user, "User Avatar Image updated successfully"))

})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath) throw new ApiError(400, "coverImage file is missing")

    const coverImage = await uploadOnCoudinary(coverImageLocalPath)

    if(!coverImage.url) throw new ApiError(400, "Error while uploading coverImage file")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "User Cover Image updated successfully"))

})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const {username} = req.params
    if(!username?.trim()) throw new ApiError(400, "Username is missing")
    
    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $condition: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                email: 1,
                avatar: 1,
                coverImage: 1
            }
        }
    ])
    console.log(channel)

    if(!channel?.length){
        throw new ApiError(404, "channel does not exists ")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler( async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully")
    )
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}